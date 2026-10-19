import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  upsertExerciseNode,
  deleteExerciseNode,
  setExerciseStrains,
} from "@/lib/graph-training";

const exerciseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  muscleGroup: z.string().trim().min(2).max(60),
  equipment: z.string().trim().max(60).optional(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
  injuryIds: z.array(z.coerce.number().int().positive()).default([]),
});

const updateSchema = exerciseSchema.extend({
  exerciseId: z.coerce.number().int().positive(),
});

const deleteSchema = z.object({ exerciseId: z.coerce.number().int().positive() });

/** Admin-only. proxy.ts already keeps non-admins out of /admin pages; this is
 *  the same check on the data, since the API is reachable directly. */
async function requireAdmin() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  if (session.role !== "admin") {
    return { error: NextResponse.json({ error: "Administrators only" }, { status: 403 }) };
  }
  return { session };
}

// GET — the catalog with the injuries each exercise strains.
export async function GET() {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const data = await withUser(session, async (q) => {
    const [exercises, injuries] = await Promise.all([
      q(`SELECT e.exercise_id, e.name, e.muscle_group, e.equipment, e.difficulty,
                COALESCE(
                  array_agg(ei.injury_id ORDER BY ei.injury_id)
                    FILTER (WHERE ei.injury_id IS NOT NULL),
                  '{}'
                ) AS injury_ids
           FROM exercises e
           LEFT JOIN exercise_injuries ei ON ei.exercise_id = e.exercise_id
          GROUP BY e.exercise_id
          ORDER BY e.muscle_group, e.name`),
      q(`SELECT injury_id, name, body_part FROM injuries ORDER BY body_part, name`),
    ]);
    return { exercises: exercises.rows, injuries: injuries.rows };
  });

  return NextResponse.json(data);
}

// POST — add an exercise and the injuries it strains.
export async function POST(request: Request) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const parsed = exerciseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the values you entered" },
      { status: 400 }
    );
  }

  const { name, muscleGroup, equipment, difficulty, injuryIds } = parsed.data;

  let exerciseId: number;
  try {
    // PostgreSQL first: it is the source of truth, and the UNIQUE constraint
    // on name is what rejects a duplicate.
    exerciseId = await withUser(session, async (q) => {
      const inserted = await q<{ exercise_id: number }>(
        `INSERT INTO exercises (name, muscle_group, equipment, difficulty)
         VALUES ($1, $2, $3, $4)
         RETURNING exercise_id`,
        [name, muscleGroup, equipment || null, difficulty]
      );

      const id = inserted.rows[0].exercise_id;

      for (const injuryId of injuryIds) {
        await q(
          `INSERT INTO exercise_injuries (exercise_id, injury_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, injuryId]
        );
      }

      return id;
    });
  } catch (err) {
    const code = typeof err === "object" && err !== null && "code" in err ? err.code : undefined;
    if (code === "23505") {
      return NextResponse.json({ error: "An exercise with that name already exists" }, { status: 409 });
    }
    if (code === "23503") {
      return NextResponse.json({ error: "One of those injuries does not exist" }, { status: 400 });
    }
    console.error("create exercise failed", err);
    return NextResponse.json({ error: "Could not add the exercise" }, { status: 500 });
  }

  // Then the graph, so the safe-exercise query sees the new exercise.
  try {
    await upsertExerciseNode(exerciseId, name, muscleGroup);
    await setExerciseStrains(exerciseId, injuryIds);
  } catch (err) {
    console.error("could not mirror exercise to the graph", err);
    return NextResponse.json(
      { ok: true, exerciseId, warning: "Saved, but the graph was not updated. Re-run the sync script." },
      { status: 201 }
    );
  }

  return NextResponse.json({ ok: true, exerciseId }, { status: 201 });
}

// PUT — edit an exercise and replace the injuries it strains.
export async function PUT(request: Request) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the values you entered" }, { status: 400 });
  }

  const { exerciseId, name, muscleGroup, equipment, difficulty, injuryIds } = parsed.data;

  try {
    const found = await withUser(session, async (q) => {
      const updated = await q(
        `UPDATE exercises
            SET name = $2, muscle_group = $3, equipment = $4, difficulty = $5
          WHERE exercise_id = $1`,
        [exerciseId, name, muscleGroup, equipment || null, difficulty]
      );

      if (updated.rowCount === 0) return false;

      // Replace rather than merge, so unticking an injury removes it.
      await q(`DELETE FROM exercise_injuries WHERE exercise_id = $1`, [exerciseId]);
      for (const injuryId of injuryIds) {
        await q(
          `INSERT INTO exercise_injuries (exercise_id, injury_id) VALUES ($1, $2)`,
          [exerciseId, injuryId]
        );
      }
      return true;
    });

    if (!found) return NextResponse.json({ error: "No such exercise" }, { status: 404 });
  } catch (err) {
    const code = typeof err === "object" && err !== null && "code" in err ? err.code : undefined;
    if (code === "23505") {
      return NextResponse.json({ error: "An exercise with that name already exists" }, { status: 409 });
    }
    console.error("update exercise failed", err);
    return NextResponse.json({ error: "Could not save the changes" }, { status: 500 });
  }

  try {
    await upsertExerciseNode(exerciseId, name, muscleGroup);
    await setExerciseStrains(exerciseId, injuryIds);
  } catch (err) {
    console.error("could not mirror exercise to the graph", err);
    return NextResponse.json({
      ok: true,
      warning: "Saved, but the graph was not updated. Re-run the sync script.",
    });
  }

  return NextResponse.json({ ok: true });
}

// DELETE — remove an exercise from both databases.
export async function DELETE(request: Request) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Which exercise?" }, { status: 400 });

  const { exerciseId } = parsed.data;

  try {
    const removed = await withUser(session, async (q) => {
      const result = await q(`DELETE FROM exercises WHERE exercise_id = $1`, [exerciseId]);
      return result.rowCount ?? 0;
    });

    if (removed === 0) return NextResponse.json({ error: "No such exercise" }, { status: 404 });
  } catch (err) {
    // 23503: workout_logs.exercise_id has no ON DELETE CASCADE on purpose —
    // removing an exercise from the catalog must not erase people's history.
    const code = typeof err === "object" && err !== null && "code" in err ? err.code : undefined;
    if (code === "23503") {
      return NextResponse.json(
        { error: "That exercise cannot be deleted because people have logged it." },
        { status: 409 }
      );
    }
    console.error("delete exercise failed", err);
    return NextResponse.json({ error: "Could not delete the exercise" }, { status: 500 });
  }

  try {
    await deleteExerciseNode(exerciseId);
  } catch (err) {
    console.error("could not remove exercise from the graph", err);
  }

  return NextResponse.json({ ok: true });
}
