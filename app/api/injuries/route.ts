import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { addInjuryEdge, removeInjuryEdge } from "@/lib/graph-training";

const addSchema = z.object({
  injuryId: z.coerce.number().int().positive(),
  severity: z.enum(["mild", "moderate", "severe"]).default("moderate"),
});

const removeSchema = z.object({
  injuryId: z.coerce.number().int().positive(),
});

// GET /api/injuries — the catalog, each flagged with whether this user has it.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const injuries = await withUser(session, async (q) => {
    const result = await q(
      `SELECT i.injury_id, i.name, i.body_part, i.description,
            ui.severity, ui.noted_on,
            (ui.user_id IS NOT NULL) AS has_injury
       FROM injuries i
       LEFT JOIN user_injuries ui
              ON ui.injury_id = i.injury_id AND ui.user_id = $1
        ORDER BY i.body_part, i.name`,
      [session.userId]
    );
    return result.rows;
  });

  return NextResponse.json({ injuries });
}

// POST /api/injuries — record an injury against the signed-in user.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = addSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Pick an injury and a severity" }, { status: 400 });
  }

  try {
    await withUser(session, (q) =>
      q(
        `INSERT INTO user_injuries (user_id, injury_id, severity)
       VALUES ($1, $2, $3)
         ON CONFLICT (user_id, injury_id) DO UPDATE SET severity = EXCLUDED.severity`,
        [session.userId, parsed.data.injuryId, parsed.data.severity]
      )
    );
  } catch (err) {
    const code = typeof err === "object" && err !== null && "code" in err ? err.code : undefined;
    if (code === "23503") {
      return NextResponse.json({ error: "That injury does not exist" }, { status: 400 });
    }
    console.error("add injury failed", err);
    return NextResponse.json({ error: "Could not record the injury" }, { status: 500 });
  }

  // Mirror the edge so the safe-exercise query sees the new injury. PostgreSQL
  // is the source of truth and has already committed, so a graph failure is
  // logged rather than failing the request.
  try {
    await addInjuryEdge(session.userId, parsed.data.injuryId, parsed.data.severity);
  } catch (err) {
    console.error("could not add HAS_INJURY edge", err);
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

// DELETE /api/injuries — remove one. Exercises it was blocking become
// available again, since the trigger reads user_injuries at insert time.
export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = removeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Which injury?" }, { status: 400 });
  }

  await withUser(session, (q) =>
    q(`DELETE FROM user_injuries WHERE user_id = $1 AND injury_id = $2`, [
      session.userId,
      parsed.data.injuryId,
    ])
  );

  try {
    await removeInjuryEdge(session.userId, parsed.data.injuryId);
  } catch (err) {
    console.error("could not remove HAS_INJURY edge", err);
  }

  return NextResponse.json({ ok: true });
}
