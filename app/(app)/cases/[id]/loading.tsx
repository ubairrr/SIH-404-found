import { RouteSkeleton } from "@/app/components/route-skeleton";

// Phase 05 (05-02): mirrors the case-detail page's FIR-number/title header
// plus the four-tab TabBar underneath it. Next.js file-convention Suspense
// fallback for the dynamic `[id]` segment — no params are available to (or
// needed by) a loading.tsx file.
export default function Loading() {
  return <RouteSkeleton variant="header-tabs" />;
}
