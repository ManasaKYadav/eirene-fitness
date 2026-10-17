"use client";

import { useEffect, useState } from "react";

type Exercise = {
  exercise_id: number;
  name: string;
  muscle_group: string;
  equipment: string | null;
  difficulty: string;
  unsafe: boolean;
  strains: string | null;
};

type WorkoutLog = {
  log_id: number;
  exercise_name: string;
  muscle_group: string;
  sets: number;
  reps: number;
  weight_kg: string;
  logged_on: string;
  volume_kg: string;
};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-300";

export default function WorkoutLogger() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [exerciseId, setExerciseId] = useState("");
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [ex, wk] = await Promise.all([
      fetch("/api/exercises").then((r) => r.json()),
      fetch("/api/workouts").then((r) => r.json()),
    ]);
    setExercises(ex.exercises ?? []);
    setLogs(wk.workouts ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const selected = exercises.find((e) => String(e.exercise_id) === exerciseId);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setPending(true);

    const form = new FormData(event.currentTarget);

    const response = await fetch("/api/workouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exerciseId: form.get("exerciseId"),
        sets: form.get("sets"),
        reps: form.get("reps"),
        weightKg: form.get("weightKg") || 0,
      }),
    });

    const data = await response.json();
    setPending(false);

    if (!response.ok) {
      setMessage({ kind: "error", text: data.error ?? "Could not save the workout" });
      return;
    }

    setMessage({ kind: "ok", text: "Workout logged." });
    setExerciseId("");
    (event.target as HTMLFormElement).reset();
    load();
  }

  const byGroup = exercises.reduce<Record<string, Exercise[]>>((acc, e) => {
    (acc[e.muscle_group] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div className="space-y-10">
      <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="mb-4 font-medium">Log a workout</h2>

        {message && (
          <p
            role="alert"
            className={
              message.kind === "error"
                ? "mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
                : "mb-4 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
            }
          >
            {message.text}
          </p>
        )}

        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-5">
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="exerciseId" className="block text-sm font-medium">
              Exercise
            </label>
            <select
              id="exerciseId"
              name="exerciseId"
              required
              value={exerciseId}
              onChange={(e) => setExerciseId(e.target.value)}
              className={inputClass}
            >
              <option value="">Choose…</option>
              {Object.entries(byGroup).map(([group, items]) => (
                <optgroup key={group} label={group}>
                  {items.map((e) => (
                    <option key={e.exercise_id} value={e.exercise_id}>
                      {e.name}
                      {e.unsafe ? "  ⚠ unsafe for you" : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="sets" className="block text-sm font-medium">
              Sets
            </label>
            <input id="sets" name="sets" type="number" min={1} max={50} defaultValue={3} required className={inputClass} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="reps" className="block text-sm font-medium">
              Reps
            </label>
            <input id="reps" name="reps" type="number" min={1} max={500} defaultValue={10} required className={inputClass} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="weightKg" className="block text-sm font-medium">
              Weight (kg)
            </label>
            <input id="weightKg" name="weightKg" type="number" min={0} max={500} step="0.5" defaultValue={0} className={inputClass} />
          </div>

          {selected?.unsafe && (
            <p className="sm:col-span-5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {selected.name} strains your recorded injury ({selected.strains}). The
              database will refuse this one.
            </p>
          )}

          <div className="sm:col-span-5">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {pending ? "Saving…" : "Log workout"}
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-4 font-medium">Recent workouts</h2>

        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="border-b border-zinc-200 text-left text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                <tr>
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Exercise</th>
                  <th className="py-2 pr-4 font-medium">Sets × reps</th>
                  <th className="py-2 pr-4 font-medium">Weight</th>
                  <th className="py-2 font-medium">Volume</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.log_id} className="border-b border-zinc-100 dark:border-zinc-900">
                    <td className="py-2 pr-4 tabular-nums">{l.logged_on}</td>
                    <td className="py-2 pr-4">
                      {l.exercise_name}
                      <span className="ml-2 text-xs text-zinc-500">{l.muscle_group}</span>
                    </td>
                    <td className="py-2 pr-4 tabular-nums">
                      {l.sets} × {l.reps}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{Number(l.weight_kg)} kg</td>
                    <td className="py-2 tabular-nums">{Number(l.volume_kg).toLocaleString()} kg</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
