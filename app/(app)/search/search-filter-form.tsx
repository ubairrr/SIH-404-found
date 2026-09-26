"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// 05-03: converted from a native `<form method="get" action="/search">`
// submission to a client component using `useRouter`/`useTransition`, same
// pattern as pagination-controls.tsx and the header quick-search form —
// same-route searchParams navigations fall outside loading.tsx's Suspense
// coverage (RESEARCH.md Pitfall 4), so this gives the Search button its own
// pending signal before results re-render. search/page.tsx remains the
// Server Component doing the real Prisma query, authorize() check, and
// searchParamsSchema.parse() — this component only builds the destination
// URL client-side (T-05-07: re-validated server-side regardless).
export function SearchFilterForm({
  defaultQ,
  defaultStage,
  defaultFrom,
  defaultTo,
  stageOptions,
  hasActiveFilter,
}: {
  defaultQ: string;
  defaultStage: string;
  defaultFrom: string;
  defaultTo: string;
  stageOptions: { value: string; label: string }[];
  hasActiveFilter: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [q, setQ] = useState(defaultQ);
  const [stage, setStage] = useState(defaultStage);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(() => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (stage) params.set("stage", stage);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      router.push(`/search?${params.toString()}`);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 rounded-lg border border-slate-200 bg-white p-6"
    >
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[200px] flex-1">
          <label
            htmlFor="search-q"
            className="mb-1 block text-xs font-semibold text-slate-700"
          >
            Search
          </label>
          <input
            id="search-q"
            type="text"
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="FIR number or title…"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label
            htmlFor="search-stage"
            className="mb-1 block text-xs font-semibold text-slate-700"
          >
            Stage
          </label>
          <select
            id="search-stage"
            name="stage"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
          >
            <option value="">All stages</option>
            {stageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="search-from"
            className="mb-1 block text-xs font-semibold text-slate-700"
          >
            From
          </label>
          <input
            id="search-from"
            type="date"
            name="from"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label
            htmlFor="search-to"
            className="mb-1 block text-xs font-semibold text-slate-700"
          >
            To
          </label>
          <input
            id="search-to"
            type="date"
            name="to"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600 disabled:opacity-60"
        >
          {isPending ? "Searching…" : "Search"}
        </button>

        {hasActiveFilter ? (
          <Link
            href="/search"
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            Clear filters
          </Link>
        ) : null}
      </div>
    </form>
  );
}
