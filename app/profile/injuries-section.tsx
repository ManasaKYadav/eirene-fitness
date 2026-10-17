"use client";

import { useEffect, useState } from "react";

type Injury = {
  injury_id: number;
  name: string;
  body_part: string;
  description: string | null;
  severity: string | null;
  noted_on: string | null;
  has_injury: boolean;
};

export default function InjuriesSection() {
  const [injuries, setInjuries] = useState<Injury[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const data = await fetch("/api/injuries").then((r) => r.json());
    setInjuries(data.injuries ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(injury: Injury, severity = "moderate") {
    setBusy(injury.injury_id);
    await fetch("/api/injuries", {
      method: injury.has_injury ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ injuryId: injury.injury_id, severity }),
    });
    await load();
    setBusy(null);
  }

  if (loading) return <p className="text-sm text-zinc-500">Loading…</p>;

  const mine = injuries.filter((i) => i.has_injury);

  return (
    <section>
      <h2 className="mb-1 font-medium">Injuries</h2>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        {mine.length === 0
          ? "Nothing recorded. Adding an injury blocks the exercises that strain it."
          : `${mine.length} recorded. Exercises that strain these are refused when you try to log them.`}
      </p>

      <ul className="space-y-2">
        {injuries.map((injury) => (
          <li
            key={injury.injury_id}
            className={`flex flex-wrap items-center gap-3 rounded-md border px-4 py-3 ${
              injury.has_injury
                ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
                : "border-zinc-200 dark:border-zinc-800"
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {injury.name}
                <span className="ml-2 text-xs font-normal text-zinc-500">{injury.body_part}</span>
              </p>
              {injury.description && (
                <p className="truncate text-xs text-zinc-500">{injury.description}</p>
              )}
            </div>

            {injury.has_injury && (
              <select
                value={injury.severity ?? "moderate"}
                onChange={(e) => toggle({ ...injury, has_injury: false }, e.target.value)}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="mild">mild</option>
                <option value="moderate">moderate</option>
                <option value="severe">severe</option>
              </select>
            )}

            <button
              onClick={() => toggle(injury)}
              disabled={busy === injury.injury_id}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              {busy === injury.injury_id ? "…" : injury.has_injury ? "Remove" : "I have this"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
