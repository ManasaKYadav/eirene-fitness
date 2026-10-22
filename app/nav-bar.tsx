import Link from "next/link";
import LogoutButton from "@/app/dashboard/logout-button";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/workouts", label: "Workouts" },
  { href: "/meals", label: "Meals" },
  { href: "/recommendations", label: "Recommendations" },
  { href: "/profile", label: "Profile" },
];

export default function NavBar({ role }: { role: "admin" | "user" }) {
  return (
    <nav className="mb-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-zinc-200 pb-4 dark:border-zinc-800">
      <Link href="/dashboard" className="mr-2 font-semibold tracking-tight">
        Eirene
      </Link>

      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
        >
          {link.label}
        </Link>
      ))}

      {role === "admin" && (
        <>
          <Link
            href="/admin/exercises"
            className="text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
          >
            Exercises
          </Link>
          <Link
            href="/admin/insights"
            className="text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
          >
            Insights
          </Link>
        </>
      )}

      <div className="ml-auto">
        <LogoutButton />
      </div>
    </nav>
  );
}
