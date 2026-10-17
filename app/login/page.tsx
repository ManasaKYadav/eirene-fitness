import { Suspense } from "react";
import type { Metadata } from "next";
import LoginForm from "./login-form";

export const metadata: Metadata = { title: "Sign in — Eirene" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mb-7 text-sm text-zinc-600 dark:text-zinc-400">
        Welcome back to Eirene.
      </p>

      {/* The form reads the ?next= parameter, which is dynamic, so it sits
          behind a Suspense boundary. */}
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
