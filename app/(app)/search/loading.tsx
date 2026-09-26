import { RouteSkeleton } from "@/app/components/route-skeleton";

// Phase 05 (05-02): mirrors search/page.tsx's filter-form-above-results-table
// layout — the "form-table" variant renders the filter-bar-shaped row above
// the table shape.
export default function Loading() {
  return <RouteSkeleton variant="form-table" rows={6} />;
}
