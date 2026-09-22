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

// G-03-1 hardening: trims whitespace, normalizes to the URL's origin
// (scheme+host, no path, no trailing slash), and throws a fixed, non-secret
// message when the raw value is missing/unparseable or carries a path
// segment (e.g. a dashboard URL, or /rest/v1, /storage/v1, /storage/v1/s3
// appended by mistake) — this is Supabase Storage's actual "Invalid path
// specified in request URL" failure mode observed on Vercel (2026-09-20).
export function resolveSupabaseUrl(raw: string | undefined): string {
  const INVALID_URL_MESSAGE =
    "SUPABASE_URL must be the project API origin, e.g. https://<project-ref>.supabase.co (no path, no trailing slash)";

  if (!raw) {
    throw new Error(INVALID_URL_MESSAGE);
  }

  const trimmed = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(INVALID_URL_MESSAGE);
  }

  const pathname = parsed.pathname.replace(/\/+$/, "");
  if (pathname !== "") {
    throw new Error(INVALID_URL_MESSAGE);
  }

  return parsed.origin;
}
