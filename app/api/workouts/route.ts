import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { recordDidExercise } from "@/lib/graph-training";

const logSchema = z.object({
  exerciseId: z.coerce.number().int().positive(),
  sets: z.coerce.number().int().min(1).max(50),
  reps: z.coerce.number().int().min(1).max(500),
  weightKg: z.coerce.number().min(0).max(500).default(0),
  loggedOn: z.iso.date().optional(),
});

// GET /api/workouts — the signed-in user's logs, most recent first.
//
// The WHERE clause names the user, and row-level security enforces the same
// thing underneath: inside withUser the connection is eirene_user with
// app.user_id set, so the policy would filter these rows even without it.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const workouts = await withUser(session, async (q) => {
    const result = await q(
      `SELECT w.log_id, w.exercise_id, e.name AS exercise_name, e.muscle_group,
              w.sets, w.reps, w.weight_kg, w.logged_on,
              (w.sets * w.reps * w.weight_kg) AS volume_kg
         FROM workout_logs w
         JOIN exercises e ON e.exercise_id = w.exercise_id
        WHERE w.user_id = $1
        ORDER BY w.logged_on DESC, w.log_id DESC
        LIMIT 100`,
      [session.userId]
    );
    return result.rows;
  });

  return NextResponse.json({ workouts });
}

// POST /api/workouts — log one exercise through the log_workout procedure.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const parsed = logSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the values you entered" },
      { status: 400 }
    );
  }

  const { exerciseId, sets, reps, weightKg, loggedOn } = parsed.data;

  try {
    // withUser opens the transaction, so the procedure's INSERT and its
    // UPDATE of last_workout_on both roll back together if the safety
    // trigger fires.
    await withUser(session, async (q) => {
      await q("CALL log_workout($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE))", [
        session.userId,
        exerciseId,
        sets,
        reps,
        weightKg,
        loggedOn ?? null,
      ]);
    });
  } catch (err) {
    const code = typeof err === "object" && err !== null && "code" in err ? err.code : undefined;

    // 23514 = check_violation, raised by the safety trigger. Its message
    // names the exercise and the injury, so it is shown to the user as-is.
    if (code === "23514") {
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : "That exercise is unsafe for you",
          reason: "unsafe",
        },
        { status: 409 }
      );
    }

    // 23503 = foreign_key_violation: an exercise_id that does not exist.
    if (code === "23503") {
      return NextResponse.json({ error: "That exercise does not exist" }, { status: 400 });
    }

    console.error("log workout failed", err);
    return NextResponse.json({ error: "Could not save the workout" }, { status: 500 });
  }

  // PostgreSQL has committed, so the workout is saved. The graph is updated
  // afterwards: a failure here must not undo a valid workout, so it is logged
  // and the request still succeeds. The sync script can repair the edge.
  try {
    await recordDidExercise(session.userId, exerciseId);
  } catch (err) {
    console.error("could not record DID edge", err);
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
