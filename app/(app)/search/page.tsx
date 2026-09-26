import type { Prisma, Stage } from "@prisma/client";

import { authorize } from "@/app/lib/authorize";
import { prisma } from "@/app/lib/prisma";
import { STAGE_OWNER } from "@/app/lib/case-guards";
import { STAGE_BADGE_CLASS, STAGE_LABELS } from "@/app/lib/role-display";
import { PaginationControls } from "@/app/(app)/admin/log/pagination-controls";
import {
  computeInclusiveIstRange,
  searchParamsSchema,
} from "@/app/lib/validation/search";

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

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Search cases</h1>

      <p className="mt-6 text-sm text-slate-600">
        Showing {total} case{total === 1 ? "" : "s"}.
      </p>

      {cases.length === 0 ? (
        <div className="mt-3 flex flex-col items-center justify-center gap-2 rounded-lg border border-slate-200 px-6 py-12 text-center">
          <p className="text-sm font-semibold text-slate-900">
            No cases match these filters.
          </p>
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">
                  FIR No.
                </th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">
                  Title
                </th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">
                  Stage
                </th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">
                  Registered
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {cases.map((kase) => (
                <tr key={kase.id}>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-900">
                    {kase.firNumber}
                  </td>
                  <td
                    className="max-w-[240px] truncate px-3 py-2 text-slate-900"
                    title={kase.title}
                  >
                    {kase.title}
                  </td>
                  <td className="px-3 py-2">
                    <span className={STAGE_BADGE_CLASS}>
                      {STAGE_LABELS[kase.stage]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                    {kase.createdAt.toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PaginationControls
        page={clampedPage}
        totalPages={totalPages}
        basePath={basePath}
      />
    </div>
  );
}
