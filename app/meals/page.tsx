import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import NavBar from "@/app/nav-bar";
import MealForm from "./meal-form";

export const metadata: Metadata = { title: "Meals — Eirene" };

type SafeFood = { food_id: number; food_name: string; calories: string };

type Meal = {
  meal_log_id: number;
  logged_on: string;
  meal_type: string;
  servings: string;
  food_name: string;
  calories: string;
};

export default async function MealsPage() {
  const session = await getSession();

  // proxy.ts already redirects signed-out visitors. This is the second check.
  if (!session) redirect("/login");

  const { safeFoods, todayCalories, meals, totalFoods } = await withUser(
    session,
    async (q) => {
      const safe = await q<SafeFood>(
        `SELECT food_id, food_name, calories
           FROM v_safe_foods
          WHERE user_id = $1
          ORDER BY food_name`,
        [session.userId]
      );
      const today = await q<{ total: string }>(
        `SELECT daily_calories($1, CURRENT_DATE) AS total`,
        [session.userId]
      );
      const recent = await q<Meal>(
        `SELECT m.meal_log_id, m.logged_on, m.meal_type, m.servings,
                f.name AS food_name, f.calories * m.servings AS calories
           FROM meal_logs m
           JOIN foods f ON f.food_id = m.food_id
          WHERE m.user_id = $1
          ORDER BY m.logged_on DESC, m.meal_log_id DESC
          LIMIT 15`,
        [session.userId]
      );
      const all = await q<{ count: string }>(`SELECT count(*) AS count FROM foods`);

      return {
        safeFoods: safe.rows,
        todayCalories: Number(today.rows[0]?.total ?? 0),
        meals: recent.rows,
        totalFoods: Number(all.rows[0]?.count ?? 0),
      };
    }
  );

  const hiddenCount = totalFoods - safeFoods.length;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <NavBar role={session.role} />

      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Meals</h1>
      <p className="mb-8 text-sm text-zinc-600 dark:text-zinc-400">
        Log what you ate. Only foods that are safe for you are listed.
      </p>

      <section className="mb-10 grid gap-4 sm:grid-cols-3">
        <Stat label="Calories today" value={`${Math.round(todayCalories).toLocaleString()} kcal`} />
        <Stat label="Foods you can log" value={String(safeFoods.length)} />
        <Stat
          label="Foods hidden for you"
          value={String(hiddenCount)}
          tone={hiddenCount > 0 ? "warn" : "plain"}
        />
      </section>

      {hiddenCount > 0 && (
        <p className="mb-8 text-sm text-zinc-600 dark:text-zinc-400">
          Hidden foods contain an allergen from your profile, including ones inside sauces
          and other ingredients.
        </p>
      )}

      <section className="mb-10">
        <h2 className="mb-3 font-medium">Log a meal</h2>
        <MealForm
          foods={safeFoods.map((f) => ({
            food_id: f.food_id,
            food_name: f.food_name,
            calories: Number(f.calories),
          }))}
        />
      </section>

      <section>
        <h2 className="mb-3 font-medium">Recent meals</h2>
        {meals.length === 0 ? (
          <p className="text-sm text-zinc-500">No meals logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="border-b border-zinc-200 text-left text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                <tr>
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Meal</th>
                  <th className="py-2 pr-4 font-medium">Food</th>
                  <th className="py-2 pr-4 font-medium">Servings</th>
                  <th className="py-2 font-medium">Calories</th>
                </tr>
              </thead>
              <tbody>
                {meals.map((m) => (
                  <tr key={m.meal_log_id} className="border-b border-zinc-100 dark:border-zinc-900">
                    <td className="py-2 pr-4 tabular-nums">{m.logged_on}</td>
                    <td className="py-2 pr-4 capitalize">{m.meal_type}</td>
                    <td className="py-2 pr-4">{m.food_name}</td>
                    <td className="py-2 pr-4 tabular-nums">{Number(m.servings)}</td>
                    <td className="py-2 tabular-nums">{Math.round(Number(m.calories))} kcal</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: string;
  tone?: "plain" | "warn";
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        tone === "warn"
          ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <p className="text-xs text-zinc-600 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}