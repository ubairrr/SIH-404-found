import { RouteSkeleton } from "@/app/components/route-skeleton";

// Phase 05 (05-01): first (and only, for this plan) loading.tsx in the
// app — proves the shared RouteSkeleton primitive renders correctly on a
// real route before the remaining five route segments adopt it in 05-02.
// Matches DashboardTables' two-table shape closely enough with one table
// block; real per-section row counts are deliberately not shown here.
export default function Loading() {
  return <RouteSkeleton variant="table" rows={6} />;
}
