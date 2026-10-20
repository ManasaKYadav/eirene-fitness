"use client";

import { useEffect, useState } from "react";

type Exercise = {
  exercise_id: number;
  name: string;
  muscle_group: string;
  equipment: string | null;
  difficulty: string;
  injury_ids: number[];
};

type Injury = { injury_id: number; name: string; body_part: string };

type Draft = {
  exerciseId?: number;
  name: string;
  muscleGroup: string;
  equipment: string;
  difficulty: string;
  injuryIds: number[];
};

const empty: Draft = {
  name: "",
  muscleGroup: "",
  equipment: "",
  difficulty: "beginner",
  injuryIds: [],
};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-300";

export default function ExerciseManager() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [injuries, setInjuries] = useState<Injury[]>([]);
  const [draft, setDraft] = useState<Draft>(empty);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    const data = await fetch("/api/admin/exercises").then((r) => r.json());
    setExercises(data.exercises ?? []);
    setInjuries(data.injuries ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setPending(true);

    const editing = draft.exerciseId !== undefined;
    const response = await fetch("/api/admin/exercises", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await response.json();
    setPending(false);

    if (!response.ok) {
      setMessage({ kind: "error", text: data.error ?? "Could not save" });
      return;
    }

    setMessage({
      kind: data.warning ? "error" : "ok",
      text: data.warning ?? (editing ? "Exercise updated." : "Exercise added."),
    });
    setDraft(empty);
    load();
  }

  async function remove(exercise: Exercise) {
    if (!confirm(`Delete ${exercise.name}?`)) return;
    setMessage(null);

    const response = await fetch("/api/admin/exercises", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exerciseId: exercise.exercise_id }),
    });
    const data = await response.json();

    if (!response.ok) {
      setMessage({ kind: "error", text: data.error ?? "Could not delete" });
      return;
    }
    setMessage({ kind: "ok", text: `${exercise.name} deleted.` });
    load();
  }

  function edit(exercise: Exercise) {
    setDraft({
      exerciseId: exercise.exercise_id,
      name: exercise.name,
      muscleGroup: exercise.muscle_group,
      equipment: exercise.equipment ?? "",
      difficulty: exercise.difficulty,
      injuryIds: exercise.injury_ids ?? [],
    });
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleInjury(injuryId: number) {
    setDraft((d) => ({
      ...d,
      injuryIds: d.injuryIds.includes(injuryId)
        ? d.injuryIds.filter((id) => id !== injuryId)
        : [...d.injuryIds, injuryId],
    }));
  }

  const injuryName = (id: number) => injuries.find((i) => i.injury_id === id)?.name ?? String(id);

  return (
    <div className="space-y-10">
      <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="mb-4 font-medium">
          {draft.exerciseId ? `Edit ${draft.name || "exercise"}` : "Add an exercise"}
        </h2>

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

        <form onSubmit={save} className="grid gap-4 sm:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="name" className="block text-sm font-medium">Name</label>
            <input
              id="name"
              required
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className={inputClass}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="muscleGroup" className="block text-sm font-medium">Muscle group</label>
            <input
              id="muscleGroup"
              required
              value={draft.muscleGroup}
              onChange={(e) => setDraft({ ...draft, muscleGroup: e.target.value })}
              className={inputClass}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="equipment" className="block text-sm font-medium">Equipment</label>
            <input
              id="equipment"
              value={draft.equipment}
              onChange={(e) => setDraft({ ...draft, equipment: e.target.value })}
              className={inputClass}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="difficulty" className="block text-sm font-medium">Difficulty</label>
            <select
              id="difficulty"
              value={draft.difficulty}
              onChange={(e) => setDraft({ ...draft, difficulty: e.target.value })}
              className={inputClass}
            >
              <option value="beginner">beginner</option>
              <option value="intermediate">intermediate</option>
              <option value="advanced">advanced</option>
            </select>
          </div>

          <fieldset className="sm:col-span-4">
            <legend className="mb-2 text-sm font-medium">Injuries this strains</legend>
            <p className="mb-2 text-xs text-zinc-500">
              Ticking an injury here is what stops users who have it from logging
              this exercise — it writes the STRAINS edge the safety check reads.
            </p>
            <div className="flex flex-wrap gap-2">
              {injuries.map((injury) => {
                const on = draft.injuryIds.includes(injury.injury_id);
                return (
                  <button
                    type="button"
                    key={injury.injury_id}
                    onClick={() => toggleInjury(injury.injury_id)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      on
                        ? "border-amber-400 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                        : "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
                    }`}
                  >
                    {on ? "✓ " : ""}
                    {injury.name}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="flex gap-3 sm:col-span-4">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {pending ? "Saving…" : draft.exerciseId ? "Save changes" : "Add exercise"}
            </button>
            {draft.exerciseId && (
              <button
                type="button"
                onClick={() => { setDraft(empty); setMessage(null); }}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-4 font-medium">Catalog ({exercises.length})</h2>
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] text-sm">
              <thead className="border-b border-zinc-200 text-left text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                <tr>
                  <th className="py-2 pr-4 font-medium">Exercise</th>
                  <th className="py-2 pr-4 font-medium">Group</th>
                  <th className="py-2 pr-4 font-medium">Equipment</th>
                  <th className="py-2 pr-4 font-medium">Strains</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {exercises.map((e) => (
                  <tr key={e.exercise_id} className="border-b border-zinc-100 dark:border-zinc-900">
                    <td className="py-2 pr-4">
                      {e.name}
                      <span className="ml-2 text-xs text-zinc-500">{e.difficulty}</span>
                    </td>
                    <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">{e.muscle_group}</td>
                    <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">{e.equipment ?? "—"}</td>
                    <td className="py-2 pr-4">
                      {e.injury_ids?.length ? (
                        <span className="text-amber-700 dark:text-amber-300">
                          {e.injury_ids.map(injuryName).join(", ")}
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => edit(e)}
                        className="mr-3 text-xs font-medium underline underline-offset-4"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => remove(e)}
                        className="text-xs font-medium text-red-700 underline underline-offset-4 dark:text-red-400"
                      >
                        Delete
                      </button>
                    </td>
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
