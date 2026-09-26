"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Spinner } from "@/app/components/spinner";

// Phase 05 (05-01), LOAD-03: header quick-search pending state. Copies
// pagination-controls.tsx's exact useTransition + useRouter shape rather
// than relying on the plain GET form's native (invisible) browser
// tab-spinner. First of two GET-form conversions this phase — /search's
// own filter form is 05-03's scope.
export function QuickSearchForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(() => {
          router.push(`/search?q=${encodeURIComponent(value)}`);
        });
      }}
      className="flex items-center gap-2"
    >
      <input
        type="text"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="FIR number or title…"
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500"
      />
      <button type="submit" disabled={isPending} className="flex items-center">
        {isPending && <Spinner className="h-3 w-3" />}
        <span className="sr-only">Search</span>
      </button>
    </form>
  );
}
