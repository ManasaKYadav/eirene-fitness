"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Goal = { goal_id: number; name: string };
type Allergen = { allergen_id: number; name: string };
type MyAllergy = Allergen & { severity: string };

const SEVERITIES = ["mild", "moderate", "severe"] as const;

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";
const buttonClass =
  "rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900";

export default function GoalAllergiesForm({
  goals,
  currentGoalId,
  allergens,
  mine,
}: {
  goals: Goal[];
  currentGoalId: number | null;
  allergens: Allergen[];
  mine: MyAllergy[];
}) {
  const router = useRouter();
  const [goalId, setGoalId] = useState(currentGoalId === null ? "" : String(currentGoalId));
  const [pickedAllergen, setPickedAllergen] = useState("");
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>("moderate");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Allergens the user has not added yet. If the picked one was just added,
  // fall back to the first remaining option.
  const available = allergens.filter((a) => !mine.some((m) => m.allergen_id === a.allergen_id));
  const allergenId = available.some((a) => String(a.allergen_id) === pickedAllergen)
    ? pickedAllergen
    : String(available[0]?.allergen_id ?? "");

  async function send(url: string, method: string, body: unknown, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage({ kind: "error", text: data.error ?? "Something went wrong. Try again." });
        return;
      }

      setMessage({ kind: "ok", text: success });
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "Could not reach the server. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="mb-2 text-sm font-medium">Your goal</h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block w-full max-w-xs text-sm">
            <span className="sr-only">Goal</span>
            <select
              className={inputClass}
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
            >
              <option value="">No goal</option>
              {goals.map((g) => (
                <option key={g.goal_id} value={g.goal_id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            className={buttonClass}
            onClick={() =>
              send(
                "/api/profile/goal",
                "PUT",
                { goalId: goalId === "" ? null : Number(goalId) },
                "Goal saved."
              )
            }
          >
            Save goal
          </button>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Your allergies</h3>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          Foods containing these, including ones hidden inside sauces and other ingredients,
          are hidden from your meals and recommendations.
        </p>

        {mine.length === 0 ? (
          <p className="mb-4 text-sm text-zinc-500">No allergies recorded.</p>
        ) : (
          <ul className="mb-4 space-y-1.5 text-sm">
            {mine.map((a) => (
              <li key={a.allergen_id} className="flex items-center justify-between gap-4">
                <span>
                  {a.name} <span className="text-zinc-500">· {a.severity}</span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  className="text-sm underline underline-offset-4 disabled:opacity-50"
                  onClick={() =>
                    send(
                      "/api/profile/allergies",
                      "DELETE",
                      { allergenId: a.allergen_id },
                      `${a.name} removed.`
                    )
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {available.length > 0 && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Allergen</span>
              <select
                className={inputClass}
                value={allergenId}
                onChange={(e) => setPickedAllergen(e.target.value)}
              >
                {available.map((a) => (
                  <option key={a.allergen_id} value={a.allergen_id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Severity</span>
              <select
                className={`${inputClass} capitalize`}
                value={severity}
                onChange={(e) => setSeverity(e.target.value as (typeof SEVERITIES)[number])}
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy}
              className={buttonClass}
              onClick={() =>
                send(
                  "/api/profile/allergies",
                  "POST",
                  { allergenId: Number(allergenId), severity },
                  "Allergy added."
                )
              }
            >
              Add allergy
            </button>
          </div>
        )}
      </div>

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
  );
}