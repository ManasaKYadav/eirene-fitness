import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import NavBar from "@/app/nav-bar";
import InsightsTables from "./insights-tables";

export const metadata: Metadata = { title: "Insights — Eirene admin" };

export default async function AdminInsightsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/dashboard?denied=admin");

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <NavBar role={session.role} />

      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Insights</h1>
      <p className="mb-8 text-sm text-zinc-600 dark:text-zinc-400">
        Two reporting queries across all users. The SQL for each is shown with
        its results.
      </p>

      <InsightsTables />
    </main>
  );
}
