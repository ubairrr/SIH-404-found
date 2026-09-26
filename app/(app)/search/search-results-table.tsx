import Link from "next/link";
import type { Case, Stage } from "@prisma/client";

import { STAGE_BADGE_CLASS, STAGE_LABELS } from "@/app/lib/role-display";

// D-12: results table columns FIR No. / Title / Stage / Police station /
// Registered / At your stage. D-15: zero matches renders the empty state
// (with a Clear filters link) instead of an empty table. D-14: result count
// line above the table/empty state.
export function SearchResultsTable({
  cases,
  ownedStages,
  total,
}: {
  cases: Case[];
  ownedStages: Stage[];
  total: number;
}) {
  return (
    <div>
      <p className="mb-3 text-sm text-slate-600">
        Showing {total} case{total === 1 ? "" : "s"}.
      </p>

      {cases.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-slate-200 px-6 py-12 text-center">
          <p className="text-sm font-semibold text-slate-900">
            No cases match these filters.
          </p>
          <Link
            href="/search"
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
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
                  Police station
                </th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">
                  Registered
                </th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">
                  At your stage
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {cases.map((kase) => (
                <tr key={kase.id}>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-900">
                    <Link href={`/cases/${kase.id}`} className="hover:underline">
                      {kase.firNumber}
                    </Link>
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
                  <td className="px-3 py-2 text-slate-700">
                    {kase.policeStation}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                    {kase.createdAt.toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2">
                    {ownedStages.includes(kase.stage) ? (
                      <span className="rounded-full border border-blue-300 bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                        At your stage
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
