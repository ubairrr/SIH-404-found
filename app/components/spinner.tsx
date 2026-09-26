"use client";

// Phase 05 (05-01): first shared cross-page UI primitive — a small inline
// spinner reused wherever a pending control needs a spinning indicator
// instead of (or alongside) a gerund label. `motion-reduce:animate-none`
// keeps the indicator visible but static for prefers-reduced-motion users
// (LOAD-07) rather than removing it entirely.
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-4 w-4 animate-spin motion-reduce:animate-none rounded-full border-2 border-slate-300 border-t-blue-700 ${className}`}
    />
  );
}
