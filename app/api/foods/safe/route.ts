import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withUser } from "@/lib/db";

type SafeFood = { food_id: number; food_name: string; calories: string };

/** Foods with none of the signed-in user's allergens, including allergens
 *  hidden inside nested ingredients. Reads v_safe_foods through withUser, so
 *  row-level security decides whose allergies are visible. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to see safe foods." }, { status: 401 });
  }

  const result = await withUser(session, (q) =>
    q<SafeFood>(
      `SELECT food_id, food_name, calories
         FROM v_safe_foods
        WHERE user_id = $1
        ORDER BY food_name`,
      [session.userId]
    )
  );

  return NextResponse.json({
    foods: result.rows.map((f) => ({
      foodId: f.food_id,
      name: f.food_name,
      calories: Number(f.calories),
    })),
  });
}