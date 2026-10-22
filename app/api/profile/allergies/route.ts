import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { addAllergy, removeAllergy } from "@/lib/graph-sync";

const addSchema = z.object({
  allergenId: z.number().int().positive(),
  severity: z.enum(["mild", "moderate", "severe"]),
});

const removeSchema = z.object({
  allergenId: z.number().int().positive(),
});

function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23503";
}

async function readJson(request: Request): Promise<unknown | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/** Add an allergy, or change its severity if the user already has it. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to change your allergies." }, { status: 401 });
  }

  const body = await readJson(request);
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose an allergen and a severity." },
      { status: 400 }
    );
  }

  try {
    await withUser(session, (q) =>
      q(
        `INSERT INTO user_allergies (user_id, allergen_id, severity)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, allergen_id)
         DO UPDATE SET severity = EXCLUDED.severity`,
        [session.userId, parsed.data.allergenId, parsed.data.severity]
      )
    );
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      return NextResponse.json({ error: "That allergen doesn't exist." }, { status: 400 });
    }
    throw err;
  }

  // PostgreSQL has the allergy, so the meals route already refuses unsafe
  // foods. The graph is what the food list and recommendations read, so a
  // failure here is reported rather than left as a quiet gap.
  try {
    await addAllergy(session.userId, parsed.data.allergenId, parsed.data.severity);
  } catch (err) {
    console.error("could not add ALLERGIC_TO edge", err);
    return NextResponse.json(
      { error: "Your allergy was saved, but the food filter could not be updated. Add it again." },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

/** Remove one of the signed-in user's allergies. */
export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to change your allergies." }, { status: 401 });
  }

  const body = await readJson(request);
  const parsed = removeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose an allergen to remove." }, { status: 400 });
  }

  await withUser(session, (q) =>
    q(`DELETE FROM user_allergies WHERE user_id = $1 AND allergen_id = $2`, [
      session.userId,
      parsed.data.allergenId,
    ])
  );

  // A failure here errs on the safe side: the graph still hides the foods.
  // The allergy is gone from the profile, so retrying means adding it back and
  // removing it again, or re-running the sync script.
  try {
    await removeAllergy(session.userId, parsed.data.allergenId);
  } catch (err) {
    console.error("could not remove ALLERGIC_TO edge", err);
    return NextResponse.json(
      { error: "Your allergy was removed, but the food list still hides those foods. Add it back and remove it again to retry." },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true });
}
