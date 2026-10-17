import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import WorkoutLogger from "./workout-logger";
import NavBar from "@/app/nav-bar";

export const metadata: Metadata = { title: "Workouts — Eirene" };

export default async function WorkoutsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <NavBar role={session.role} />
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Workouts</h1>
      <p className="mb-8 text-sm text-zinc-600 dark:text-zinc-400">
        Exercises that strain an injury on your profile are refused by the
        database, not just hidden here.
      </p>
      <WorkoutLogger />
    </main>
  );
}
