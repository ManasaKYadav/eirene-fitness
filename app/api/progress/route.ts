import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

const weighInSchema = z.object({
  weightKg: z.coerce.number().min(20).max(400),
  bodyFatPct: z.coerce.number().min(1).max(70).optional(),
  notes: z.string().trim().max(500).optional(),
  loggedOn: z.iso.date().optional(),
});

// GET /api/progress — weekly training volume from the view, plus the
// user's weigh-ins.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const [weekly, weighIns] = await Promise.all([
    query(
      `SELECT week_start, workout_count, exercises_used,
              total_reps, total_volume_kg, avg_weight_kg, last_logged_on
         FROM v_weekly_progress
        WHERE user_id = $1
        ORDER BY week_start DESC
        LIMIT 12`,
      [session.userId]
    ),
    query(
      `SELECT progress_id, logged_on, weight_kg, body_fat_pct, notes
         FROM progress_logs
        WHERE user_id = $1
        ORDER BY logged_on DESC
        LIMIT 30`,
      [session.userId]
    ),
  ]);

  return NextResponse.json({ weekly: weekly.rows, weighIns: weighIns.rows });
}

// POST /api/progress — record a weigh-in.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const parsed = weighInSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the values you entered" },
      { status: 400 }
    );
  }

  const { weightKg, bodyFatPct, notes, loggedOn } = parsed.data;

  try {
    // UNIQUE (user_id, logged_on) allows one weigh-in per day, so logging
    // again on the same day corrects the earlier figure rather than failing.
    await query(
      `INSERT INTO progress_logs (user_id, logged_on, weight_kg, body_fat_pct, notes)
       VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3, $4, $5)
       ON CONFLICT (user_id, logged_on)
       DO UPDATE SET weight_kg    = EXCLUDED.weight_kg,
                     body_fat_pct = EXCLUDED.body_fat_pct,
                     notes        = EXCLUDED.notes`,
      [session.userId, loggedOn ?? null, weightKg, bodyFatPct ?? null, notes ?? null]
    );
  } catch (err) {
    const code = typeof err === "object" && err !== null && "code" in err ? err.code : undefined;
    if (code === "23514") {
      return NextResponse.json({ error: "That weight is outside the allowed range" }, { status: 400 });
    }
    console.error("weigh-in failed", err);
    return NextResponse.json({ error: "Could not save the weigh-in" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
