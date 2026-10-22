"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Food = { food_id: number; food_name: string; calories: number };

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

export default function MealForm({ foods }: { foods: Food[] }) {
  const router = useRouter();
  const [foodId, setFoodId] = useState(foods[0] ? String(foods[0].food_id) : "");
  const [servings, setServings] = useState("1");
  const [mealType, setMealType] = useState<(typeof MEAL_TYPES)[number]>("lunch");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (foods.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No foods are available for you. Check your allergies on your profile.
      </p>
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const res = await fetch("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          foodId: Number(foodId),
          servings: Number(servings),
          mealType,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage({ kind: "error", text: data.error ?? "Could not log the meal. Try again." });
        return;
      }

      setMessage({ kind: "ok", text: "Meal logged." });
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "Could not reach the server. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-4">
      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Food</span>
        <select
          className={inputClass}
          value={foodId}
          onChange={(e) => setFoodId(e.target.value)}
        >
          {foods.map((f) => (
            <option key={f.food_id} value={f.food_id}>
              {f.food_name} ({Math.round(f.calories)} kcal)
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Servings</span>
        <input
          className={inputClass}
          type="number"
          min="0.25"
          max="20"
          step="0.25"
          value={servings}
          onChange={(e) => setServings(e.target.value)}
          required
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Meal</span>
        <select
          className={`${inputClass} capitalize`}
          value={mealType}
          onChange={(e) => setMealType(e.target.value as (typeof MEAL_TYPES)[number])}
        >
          {MEAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-4 sm:col-span-4">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {busy ? "Logging…" : "Log meal"}
        </button>
        {message && (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={
              message.kind === "error"
                ? "text-sm text-red-700 dark:text-red-400"
                : "text-sm text-zinc-600 dark:text-zinc-400"
            }
          >
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}