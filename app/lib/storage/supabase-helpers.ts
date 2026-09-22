// Pure, zero-side-effect helpers factored out of supabase.ts specifically so
// they are unit-testable under plain `node --import tsx --test` without
// tripping the `import "server-only"` guard at the top of supabase.ts — same
// pattern as app/lib/audit-guards.ts (extracted for the same reason). This
// module must never import "server-only", Prisma, or Next internals.

// G-03-2: Supabase's Storage REST gateway (Kong) requires an `apikey` header
// on every request, independent of Authorization — every other adapter
// method already sends both via the supabase-js SDK; readRange is the one
// method that hand-rolls its own fetch() and was missing this header.
export function buildReadRangeHeaders(
  serviceRoleKey: string,
  rangeHeader: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
  if (rangeHeader) {
    headers.Range = rangeHeader;
  }
  return headers;
}
