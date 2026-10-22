import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { GraphUnavailableError } from "@/lib/graph-training";
import { checkedSafeFoods } from "@/lib/safe-foods";
import type { SafeFood, UnsafeFood } from "@/lib/recommendations";
import NavBar from "@/app/nav-bar";
import MealForm from "./meal-form";

export const metadata: Metadata = { title: "Meals — Eirene" };

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

  const { todayCalories, meals } = await withUser(
    session,
    async (q) => {
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

      return {
        todayCalories: Number(today.rows[0]?.total ?? 0),
        meals: recent.rows,
      };
    }
  );

  // The food list comes from the graph. If Neo4j cannot answer, the form is
  // not shown at all: an unfiltered list is how a peanut allergy meets a
  // satay sauce.
  let foods: { safe: SafeFood[]; unsafe: UnsafeFood[] } | null = null;
  try {
    foods = await checkedSafeFoods(session);
  } catch (err) {
    if (!(err instanceof GraphUnavailableError)) throw err;
    console.error("meals page: safe foods unavailable", err.cause);
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <NavBar role={session.role} />

      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Meals</h1>
      <p className="mb-8 text-sm text-zinc-600 dark:text-zinc-400">
        Log what you ate. Only foods that are safe for you are listed.
      </p>

      <section className="mb-10 grid gap-4 sm:grid-cols-3">
        <Stat label="Calories today" value={`${Math.round(todayCalories).toLocaleString()} kcal`} />
        <Stat label="Foods you can log" value={foods ? String(foods.safe.length) : "—"} />
        <Stat
          label="Foods hidden for you"
          value={foods ? String(foods.unsafe.length) : "—"}
          tone={foods && foods.unsafe.length > 0 ? "warn" : "plain"}
        />
      </section>

      <section className="mb-10">
        <h2 className="mb-3 font-medium">Log a meal</h2>
        {foods ? (
          <MealForm
            foods={foods.safe.map((f) => ({
              food_id: f.foodId,
              food_name: f.name,
              calories: f.calories,
            }))}
          />
        ) : (
          <p
            role="alert"
            className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/40"
          >
            The safe food list is unavailable right now, so meal logging is paused. Nothing is
            shown rather than a list that has not been checked against your allergies.
          </p>
        )}
      </section>

      {foods && foods.unsafe.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 font-medium">Hidden for you</h2>
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
            These contain an allergen from your profile, including ones inside sauces and other
            ingredients.
          </p>
          <ul className="space-y-1.5 text-sm">
            {foods.unsafe.map((f) => (
              <li key={f.foodId}>
                {f.name} <span className="text-zinc-500">· contains {f.allergens.join(", ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

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