"use client";

import { useFormStatus } from "react-dom";

// Phase 05 (05-01), LOAD-04: visible pending state for Logout before the
// redirect to /login completes. useFormStatus's `pending` reflects the
// real in-flight Server Action call (T-05-04 threat register: no
// optimistic "logged out" state shown before the action actually
// resolves) — must be rendered as a descendant of <form action={logout}>,
// not the form itself.
export function LogoutButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
    >
      {pending ? "Signing out…" : "Logout"}
    </button>
  );
}
