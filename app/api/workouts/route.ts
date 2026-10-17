import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool, query } from "@/lib/db";
import { getSession } from "@/lib/auth";

const logSchema = z.object({
  exerciseId: z.coerce.number().int().positive(),
  sets: z.coerce.number().int().min(1).max(50),
  reps: z.coerce.number().int().min(1).max(500),
  weightKg: z.coerce.number().min(0).max(500).default(0),
  loggedOn: z.iso.date().optional(),
});

// GET /api/workouts — the signed-in user's logs, most recent first.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const result = await query(
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

  return NextResponse.json({ workouts: result.rows });
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

  // The procedure inserts the log and moves the streak forward. Both run
  // inside this transaction, so if the safety trigger fires neither lands.
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("CALL log_workout($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE))", [
      session.userId,
      exerciseId,
      sets,
      reps,
      weightKg,
      loggedOn ?? null,
    ]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");

    const code = typeof err === "object" && err !== null && "code" in err ? err.code : undefined;

    // 23514 = check_violation, which the safety trigger raises. Its message
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
  } finally {
    client.release();
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
