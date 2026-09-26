"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

// D-13: URL-synced tab bar. The active tab is derived server-side
// (page.tsx reads searchParams.tab) and passed in as `activeTab`, so a hard
// refresh, back button, or direct deep link to `?tab=documents` all render
// the same tab with zero client hydration flicker.
//
// 05-03: converted from a plain Link-based navigation to
// `useRouter`/`useTransition`-wrapped `router.push`, matching
// pagination-controls.tsx's exact goTo() shape — same-route searchParams
// navigations fall outside loading.tsx's Suspense-boundary coverage
// (RESEARCH.md Pitfall 4), so this gives the tab bar its own pending
// signal (disabled + dimmed) for the duration of the transition.
export type CaseTab = { key: string; label: string };

export function TabBar({
  tabs,
  activeTab,
}: {
  tabs: CaseTab[];
  activeTab: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function goTo(key: string) {
    startTransition(() => {
      router.push(`?tab=${key}`);
    });
  }

  return (
    <div className="flex gap-6 border-b border-slate-200">
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => goTo(tab.key)}
            disabled={isPending}
            className={
              isActive
                ? "border-b-2 border-blue-700 px-1 py-3 text-sm font-semibold text-blue-700 disabled:opacity-70"
                : "border-b-2 border-transparent px-1 py-3 text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-70"
            }
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
