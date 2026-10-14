import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-24">
      <div className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">Eirene</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Fitness and diet recommendations that check your injuries and allergies
          first.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/login"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Log in
        </Link>
        <Link
          href="/register"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Create an account
        </Link>
        <Link
          href="/api/health"
          className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
        >
          Database health
        </Link>
      </div>
    </main>
  );
}
