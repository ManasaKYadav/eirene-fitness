import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

// GET /api/exercises — the catalog, each exercise flagged with whether it
// strains an injury this user has recorded.
//
// The flag comes from SQL so the form can grey unsafe options out before the
// user submits. It is a convenience, not the safety boundary: the trigger on
// workout_logs is what actually refuses the insert.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const result = await query(
    `SELECT e.exercise_id, e.name, e.muscle_group, e.equipment, e.difficulty,
            EXISTS (
              SELECT 1
                FROM exercise_injuries ei
                JOIN user_injuries ui ON ui.injury_id = ei.injury_id
               WHERE ei.exercise_id = e.exercise_id
                 AND ui.user_id = $1
            ) AS unsafe,
            (
              SELECT string_agg(i.name, ', ' ORDER BY i.name)
                FROM exercise_injuries ei
                JOIN user_injuries ui ON ui.injury_id = ei.injury_id
                JOIN injuries i       ON i.injury_id  = ei.injury_id
               WHERE ei.exercise_id = e.exercise_id
                 AND ui.user_id = $1
            ) AS strains
       FROM exercises e
      ORDER BY e.muscle_group, e.name`,
    [session.userId]
  );

  return NextResponse.json({ exercises: result.rows });
}
