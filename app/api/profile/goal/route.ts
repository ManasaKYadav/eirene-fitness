import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withUser } from "@/lib/db";

const goalSchema = z.object({
  goalId: z.number().int().positive().nullable(),
});

function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23503";
}

/** Set or clear the signed-in user's goal. */
export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to change your goal." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the goal as JSON." }, { status: 400 });
  }

  const parsed = goalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid goal." }, { status: 400 });
  }

  try {
    await withUser(session, (q) =>
      q(`UPDATE users SET goal_id = $1 WHERE user_id = $2`, [
        parsed.data.goalId,
        session.userId,
      ])
    );
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      return NextResponse.json({ error: "That goal doesn't exist." }, { status: 400 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
}