import { RouteSkeleton } from "@/app/components/route-skeleton";

// Phase 05 (05-02): mirrors the Admin users table shape.
export default function Loading() {
  return <RouteSkeleton variant="table" rows={5} />;
}
