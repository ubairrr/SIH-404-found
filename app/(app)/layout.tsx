import Link from "next/link";

import { verifySession } from "@/app/lib/dal";
import { logout } from "@/app/actions/auth";
import {
  ROLE_BADGE_CLASSES,
  ROLE_LABELS,
  navLinksForRole,
} from "@/app/lib/role-display";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await verifySession();
  const navLinks = navLinksForRole(user.role);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-y-2 border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex min-w-0 items-center gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-wide text-slate-900">
              CaseVault — Secure Case Records
            </p>
            <p className="text-xs text-slate-600">
              {user.role === "ADMIN"
                ? ROLE_LABELS.ADMIN
                : `${ROLE_LABELS[user.role]} — ${user.unit}`}
            </p>
            <p
              className="truncate text-xs text-slate-500"
              title={user.fullName}
            >
              {user.fullName}
            </p>
          </div>
          <span
            className={`rounded-full px-2 py-1 text-xs font-medium ${ROLE_BADGE_CLASSES[user.role]}`}
          >
            {ROLE_LABELS[user.role]}
          </span>
        </div>

        <form
          action="/search"
          method="get"
          className="flex items-center gap-2"
        >
          <input
            type="text"
            name="q"
            placeholder="FIR number or title…"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500"
          />
          <button type="submit" className="sr-only">
            Search
          </button>
        </form>

        <nav className="flex items-center gap-4">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-slate-600 transition hover:text-slate-900"
            >
              {link.label}
            </Link>
          ))}
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100"
            >
              Logout
            </button>
          </form>
        </nav>
      </header>
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}
