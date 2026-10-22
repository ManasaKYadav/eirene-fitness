import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withUser } from "@/lib/db";

const mealSchema = z.object({
  foodId: z.number().int().positive(),
  servings: z.number().positive().max(20),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
});

type Meal = {
  meal_log_id: number;
  logged_on: string;
  meal_type: string;
  servings: string;
  food_name: string;
  calories: string;
};

/** The signed-in user's recent meals and today's calorie total. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to see your meals." }, { status: 401 });
  }

  const { meals, today } = await withUser(session, async (q) => {
    const meals = await q<Meal>(
      `SELECT m.meal_log_id, m.logged_on, m.meal_type, m.servings,
              f.name AS food_name, f.calories * m.servings AS calories
         FROM meal_logs m
         JOIN foods f ON f.food_id = m.food_id
        WHERE m.user_id = $1
        ORDER BY m.logged_on DESC, m.meal_log_id DESC
        LIMIT 20`,
      [session.userId]
    );
    const today = await q<{ total: string }>(
      `SELECT daily_calories($1, CURRENT_DATE) AS total`,
      [session.userId]
    );
    return { meals: meals.rows, today: Number(today.rows[0]?.total ?? 0) };
  });

  return NextResponse.json({ todayCalories: today, meals });
}

/** Log a meal. The food is checked against v_safe_foods inside the same
 *  transaction as the insert, so an unsafe food is refused even if the form
 *  was bypassed. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to log a meal." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the meal as JSON." }, { status: 400 });
  }

  const parsed = mealSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a food, servings between 0 and 20, and a meal type." },
      { status: 400 }
    );
  }
  const { foodId, servings, mealType } = parsed.data;

  const mealLogId = await withUser(session, async (q) => {
    const safe = await q(
      `SELECT 1 FROM v_safe_foods WHERE user_id = $1 AND food_id = $2`,
      [session.userId, foodId]
    );
    if (safe.rows.length === 0) return null;

    const inserted = await q<{ meal_log_id: number }>(
      `INSERT INTO meal_logs (user_id, food_id, servings, meal_type)
       VALUES ($1, $2, $3, $4)
       RETURNING meal_log_id`,
      [session.userId, foodId, servings, mealType]
    );
    return inserted.rows[0].meal_log_id;
  });

  if (mealLogId === null) {
    return NextResponse.json(
      { error: "That food isn't available to you. It may contain one of your allergens." },
      { status: 403 }
    );
  }

  return NextResponse.json({ mealLogId }, { status: 201 });
}