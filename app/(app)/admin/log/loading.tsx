import { RouteSkeleton } from "@/app/components/route-skeleton";

// Phase 05 (05-02): mirrors the audit-log table's 6-column shape
// (Time/Actor/Role/Action/Target/Details) plus its PaginationControls
// footer. rows={8} since the real page shows up to 25 rows per page and a
// taller skeleton reads better for a full-page table than the 6-row
// dashboard skeleton.
export default function Loading() {
  return <RouteSkeleton variant="table" rows={8} />;
}
