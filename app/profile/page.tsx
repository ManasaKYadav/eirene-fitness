import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import NavBar from "@/app/nav-bar";
import InjuriesSection from "./injuries-section";

export const metadata: Metadata = { title: "Profile — Eirene" };

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <NavBar role={session.role} />

      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Profile</h1>
      <p className="mb-8 text-sm text-zinc-600 dark:text-zinc-400">
        {session.fullName} · {session.email}
      </p>

      <InjuriesSection />

      {/* Goal and allergies are added here as part of the nutrition work. */}
    </main>
  );
}
