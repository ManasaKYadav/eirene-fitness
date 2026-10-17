import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import LogoutButton from "./logout-button";

export const metadata: Metadata = { title: "Dashboard — Eirene" };

// Placeholder for Day 3, which adds weekly progress from v_weekly_progress.
// It exists now so sign-in, sign-out and the role redirects have somewhere to
// land.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const session = await getSession();

  // proxy.ts already redirects signed-out visitors. This is the second check:
  // the page never renders user data on the strength of a redirect alone.
  if (!session) {
    redirect("/login");
  }

  const { denied } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Hello, {session.fullName}
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Signed in as {session.email} · role{" "}
            <span className="font-medium">{session.role}</span>
          </p>
        </div>
        <LogoutButton />
      </div>

      {denied === "admin" && (
        <p
          role="alert"
          className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          That page is for administrators only.
        </p>
      )}

      <div className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="mb-1 font-medium">Coming on Day 3</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Weekly workouts and training volume, your progress trend, and the
          injuries recorded on your profile.
        </p>
      </div>

      {session.role === "admin" && (
        <Link
          href="/admin/exercises"
          className="mt-4 inline-block text-sm font-medium underline underline-offset-4"
        >
          Manage the exercise catalog
        </Link>
      )}
    </main>
  );
}
