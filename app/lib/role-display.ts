import type { Role, Stage } from "@prisma/client";

// 02-UI-SPEC.md Color section: per-role badge colors re-tuned for the light
// theme (replaces Phase 1's dark /60-opacity classes).
export const ROLE_BADGE_CLASSES: Record<Role, string> = {
  POLICE: "border border-blue-300 bg-blue-100 text-blue-800",
  FORENSICS: "border border-teal-300 bg-teal-100 text-teal-800",
  PROSECUTION: "border border-amber-300 bg-amber-100 text-amber-800",
  COURT: "border border-rose-300 bg-rose-100 text-rose-800",
  ADMIN: "border border-slate-300 bg-slate-100 text-slate-700",
};

// 02-UI-SPEC.md: stage names, indicators not access gates (Model Change).
export const STAGE_LABELS: Record<Stage, string> = {
  FIR_REGISTERED: "FIR Registered",
  UNDER_INVESTIGATION: "Under Investigation",
  CHARGE_SHEET_FILED: "Charge Sheet Filed",
  IN_COURT: "In Court",
  CLOSED_JUDGMENT: "Closed / Judgment",
};

// 02-UI-SPEC.md "Stage/queue label badge" — one neutral class string reused
// for every stage, no per-stage hue.
export const STAGE_BADGE_CLASS =
  "rounded-full border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700";

export const ROLE_LABELS: Record<Role, string> = {
  POLICE: "Police",
  FORENSICS: "Forensics",
  PROSECUTION: "Prosecution",
  COURT: "Court",
  ADMIN: "Admin",
};

export type NavLink = { href: string; label: string };

// D-16: each role's nav contains only its own links. Admin gets Users + Log;
// each department role gets Dashboard. Phase 2 adds "Register FIR" for
// Police/Admin (D-12: only Police/Admin can register an FIR) — the Admin
// dashboard redirect removal is Plan 02-03's job, this only adds the nav
// entry.
export function navLinksForRole(role: Role): NavLink[] {
  if (role === "ADMIN") {
    return [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/search", label: "Search" },
      { href: "/admin/users", label: "Users" },
      { href: "/admin/log", label: "Change Log" },
      { href: "/cases/new", label: "Register FIR" },
    ];
  }
  if (role === "POLICE") {
    return [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/search", label: "Search" },
      { href: "/cases/new", label: "Register FIR" },
    ];
  }
  return [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/search", label: "Search" },
  ];
}
