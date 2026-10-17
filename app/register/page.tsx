import type { Metadata } from "next";
import RegisterForm from "./register-form";

export const metadata: Metadata = { title: "Create an account — Eirene" };

export default function RegisterPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Create an account</h1>
      <p className="mb-7 text-sm text-zinc-600 dark:text-zinc-400">
        Tell Eirene about your injuries and allergies, and it will keep them out
        of your plan.
      </p>

      <RegisterForm />
    </main>
  );
}
