import type { Prisma, Stage } from "@prisma/client";

import { authorize } from "@/app/lib/authorize";
import { prisma } from "@/app/lib/prisma";
import { STAGE_OWNER, STAGE_ORDER } from "@/app/lib/case-guards";
import { STAGE_LABELS } from "@/app/lib/role-display";
import { PaginationControls } from "@/app/(app)/admin/log/pagination-controls";
import {
  computeInclusiveIstRange,
  hasReversedDateRange,
  searchParamsSchema,
} from "@/app/lib/validation/search";
import { SearchFilterForm } from "./search-filter-form";
import { SearchResultsTable } from "./search-results-table";

const PAGE_SIZE = 25;

// D-10: SRCH-04 — authorize() with no role restriction is the first
// statement, same chokepoint as dashboard/page.tsx. Every role/Admin sees
// every case; there is no narrower access boundary for search to cross.
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    stage?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const user = await authorize();

  const resolvedSearchParams = await searchParams;
  // .parse() never throws — every field independently falls back via
  // .catch() (D-10: a malformed param is dropped, never passed raw).
  const parsed = searchParamsSchema.parse(resolvedSearchParams);

  const dateRange = computeInclusiveIstRange(parsed.from, parsed.to);
  const reversedDateRange = hasReversedDateRange(dateRange.gte, dateRange.lte);

  const where: Prisma.CaseWhereInput = {
    ...(parsed.q && {
      OR: [
        { firNumber: { contains: parsed.q, mode: "insensitive" } },
        { title: { contains: parsed.q, mode: "insensitive" } },
      ],
    }),
    ...(parsed.stage && { stage: parsed.stage }),
    ...((dateRange.gte || dateRange.lte) && { createdAt: dateRange }),
  };

  const ownedStages = (Object.keys(STAGE_OWNER) as Stage[]).filter(
    (stage) => STAGE_OWNER[stage] === user.role,
  );

  const total = await prisma.case.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // UI-SPEC error row: /search adds an upper clamp the Admin log page
  // doesn't have, so an out-of-range page never shows an empty table
  // beside a positive result count.
  const clampedPage = Math.min(parsed.page, totalPages);

  const cases = await prisma.case.findMany({
    where,
    orderBy: { createdAt: "desc" }, // D-13: newest registered first
    skip: (clampedPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  // basePath omits `page` entirely (Pitfall 4) so PaginationControls appends
  // its own page= param; only the active filter params are preserved.
  const otherParams = new URLSearchParams();
  if (parsed.q) otherParams.set("q", parsed.q);
  if (parsed.stage) otherParams.set("stage", parsed.stage);
  if (parsed.from) otherParams.set("from", parsed.from);
  if (parsed.to) otherParams.set("to", parsed.to);
  const otherParamsQueryString = otherParams.toString();
  const basePath = otherParamsQueryString
    ? `/search?${otherParamsQueryString}&`
    : "/search?";

  const hasActiveFilter = Boolean(
    parsed.q || parsed.stage || parsed.from || parsed.to,
  );

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Search cases</h1>

      <SearchFilterForm
        key={`${parsed.q ?? ""}|${parsed.stage ?? ""}|${parsed.from ?? ""}|${parsed.to ?? ""}`}
        defaultQ={parsed.q ?? ""}
        defaultStage={parsed.stage ?? ""}
        defaultFrom={parsed.from ?? ""}
        defaultTo={parsed.to ?? ""}
        stageOptions={STAGE_ORDER.map((stage) => ({
          value: stage,
          label: STAGE_LABELS[stage],
        }))}
        hasActiveFilter={hasActiveFilter}
      />

      {reversedDateRange ? (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          The From date is after the To date, so no cases can match. Swap the
          dates or clear filters.
        </div>
      ) : null}

      <div className="mt-6">
        <SearchResultsTable
          cases={cases}
          ownedStages={ownedStages}
          total={total}
        />
      </div>

      <PaginationControls
        page={clampedPage}
        totalPages={totalPages}
        basePath={basePath}
      />
    </div>
  );
}
