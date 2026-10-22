import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import NavBar from "@/app/nav-bar";
import { GraphUnavailableError } from "@/lib/graph-training";
import { getRecommendations, type Recommendations } from "@/lib/recommendations";

export const metadata: Metadata = { title: "Recommendations — Eirene" };

export default async function RecommendationsPage() {
  const session = await getSession();

  // proxy.ts already redirects signed-out visitors. This is the second check.
  if (!session) redirect("/login");

  let recs: Recommendations | null = null;
  try {
    recs = await getRecommendations(session.userId);
  } catch (err) {
    if (!(err instanceof GraphUnavailableError)) throw err;
    console.error("recommendations page: graph unavailable", err.cause);
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <NavBar role={session.role} />

      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Recommendations</h1>
      <p className="mb-8 text-sm text-zinc-600 dark:text-zinc-400">
        What people with the same goal as you actually do and eat. Anything that strains one of
        your injuries or contains one of your allergens is left out.
      </p>

      {recs === null ? (
        <p
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/40"
        >
          Recommendations are unavailable right now. Nothing is shown rather than a list that has
          not been checked against your injuries and allergies.
        </p>
      ) : recs.goal === null ? (
        <p className="text-sm text-zinc-500">
          Set a goal on your{" "}
          <Link href="/profile" className="underline underline-offset-4">
            profile
          </Link>{" "}
          to see what works for people like you.
        </p>
      ) : (
        <>
          <p className="mb-8 text-sm">
            Your goal: <span className="font-medium">{recs.goal}</span>
          </p>

          <section className="mb-10">
            <h2 className="mb-3 font-medium">Exercises</h2>
            {recs.exercises.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No safe exercises logged yet by other users with your goal.
              </p>
            ) : (
              <ol className="space-y-3">
                {recs.exercises.map((e) => (
                  <Item
                    key={e.exerciseId}
                    name={e.name}
                    detail={e.muscleGroup}
                    users={e.users}
                    goal={recs.goal!}
                    mine={e.doneByMe ? "You've done this" : null}
                  />
                ))}
              </ol>
            )}
          </section>

          <section>
            <h2 className="mb-3 font-medium">Foods</h2>
            {recs.foods.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No safe foods logged yet by other users with your goal.
              </p>
            ) : (
              <ol className="space-y-3">
                {recs.foods.map((f) => (
                  <Item
                    key={f.foodId}
                    name={f.name}
                    detail={`${Math.round(f.calories)} kcal`}
                    users={f.users}
                    goal={recs.goal!}
                    mine={f.eatenByMe ? "You've eaten this" : null}
                  />
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function Item({
  name,
  detail,
  users,
  goal,
  mine,
}: {
  name: string;
  detail: string;
  users: number;
  goal: string;
  mine: string | null;
}) {
  return (
    <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{name}</p>
        <p className="text-xs text-zinc-500">{detail}</p>
      </div>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Chosen by {users} {users === 1 ? "user" : "users"} with your goal ({goal})
        {mine && <span className="text-zinc-500"> · {mine}</span>}
      </p>
    </li>
  );
}
