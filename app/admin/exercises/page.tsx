import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import NavBar from "@/app/nav-bar";
import ExerciseManager from "./exercise-manager";

export const metadata: Metadata = { title: "Exercises — Eirene admin" };

export default async function AdminExercisesPage() {
  const session = await getSession();

  // proxy.ts keeps non-admins out of /admin/*. Checked again here so the page
  // never renders on the strength of a redirect alone, and once more in the
  // API, which is reachable directly.
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/dashboard?denied=admin");

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <NavBar role={session.role} />

      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Exercise catalog</h1>
      <p className="mb-8 text-sm text-zinc-600 dark:text-zinc-400">
        Changes are written to PostgreSQL first, then mirrored to the graph, so
        the safe-exercise check sees them straight away.
      </p>

      <ExerciseManager />
    </main>
  );
}
