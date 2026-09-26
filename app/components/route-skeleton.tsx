// Phase 05 (05-01): shared route-segment loading skeleton primitive. One
// reusable component with a `variant`/`rows` prop rather than six bespoke
// skeletons per route segment (05-PATTERNS.md/05-RESEARCH.md Open Question
// 2 recommendation), matching this app's existing "controlled duplication"
// convention of sharing only when there's a real reuse benefit.
//
// Each variant renders only static Tailwind placeholder blocks shaped to
// approximate its target page — never real data, never a real row count
// (05-RESEARCH.md Pitfall: a loading.tsx skeleton must not imply exact
// numbers). `animate-pulse motion-reduce:animate-none` keeps the shimmer
// visible-but-static under prefers-reduced-motion (LOAD-07).
export type RouteSkeletonVariant =
  | "table"
  | "form-table"
  | "header-tabs"
  | "metadata-preview";

const BLOCK = "animate-pulse motion-reduce:animate-none rounded-md bg-slate-200";

function TableRows({ rows }: { rows: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className={`${BLOCK} h-9 w-full rounded-none`} />
      <div className="divide-y divide-slate-200 bg-white">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-3 py-3">
            <div className={`${BLOCK} h-4 w-full`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function FormBar() {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className={`${BLOCK} h-8 w-40`} />
      <div className={`${BLOCK} h-8 w-32`} />
      <div className={`${BLOCK} h-8 w-32`} />
      <div className={`${BLOCK} h-8 w-24`} />
      <div className={`${BLOCK} h-8 w-20`} />
    </div>
  );
}

export function RouteSkeleton({
  variant,
  rows = 4,
}: {
  variant: RouteSkeletonVariant;
  rows?: number;
}) {
  if (variant === "table") {
    return <TableRows rows={rows} />;
  }

  if (variant === "form-table") {
    return (
      <div>
        <FormBar />
        <TableRows rows={rows} />
      </div>
    );
  }

  if (variant === "header-tabs") {
    return (
      <div>
        <div className={`${BLOCK} h-6 w-64`} />
        <div className={`${BLOCK} mt-2 h-4 w-40`} />
        <div className="mt-6 flex gap-4 border-b border-slate-200 pb-2">
          <div className={`${BLOCK} h-5 w-20`} />
          <div className={`${BLOCK} h-5 w-20`} />
          <div className={`${BLOCK} h-5 w-20`} />
          <div className={`${BLOCK} h-5 w-20`} />
        </div>
      </div>
    );
  }

  // variant === "metadata-preview"
  return (
    <div>
      <div className={`${BLOCK} h-64 w-full`} />
      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <div className={`${BLOCK} h-3 w-20`} />
            <div className={`${BLOCK} mt-2 h-4 w-32`} />
          </div>
        ))}
      </dl>
    </div>
  );
}
