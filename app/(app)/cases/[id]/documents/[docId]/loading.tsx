import { RouteSkeleton } from "@/app/components/route-skeleton";

// Phase 05 (05-02): mirrors the document viewer's preview-box-then-metadata
// -card layout. Next.js file-convention Suspense fallback for the dynamic
// `[id]`/`[docId]` segments — no params are available to (or needed by) a
// loading.tsx file.
export default function Loading() {
  return <RouteSkeleton variant="metadata-preview" />;
}
