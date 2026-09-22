import { verifySession } from "@/app/lib/dal";
import { prisma } from "@/app/lib/prisma";
import { getStorageAdapter, StorageObjectNotFoundError } from "@/app/lib/storage/adapter";

// ACC-04 chokepoint: the ONLY path to file bytes. Never imports or calls the
// audit-log writer — views and downloads are explicitly out of scope for
// logging (Pitfall 5, T-03-07). Re-runs the session check and the
// case/document access check on EVERY request, independently — no cached
// authorization state is shared across requests.
export const runtime = "nodejs";

// verifySession() calls next/navigation's redirect() on a missing/invalid
// session — correct for a page render, but inside a Route Handler serving
// an <img>/<video>/<a download> target that throw surfaces as a broken
// NEXT_REDIRECT digest error, not a clean HTTP response. Per the Task 2
// checkpoint decision (03-02-PLAN.md), this local check replicates Next's
// own NEXT_REDIRECT digest shape without modifying verifySession() itself
// (shared by every page/Server Action) and without importing an internal,
// non-public Next.js module path.
// WR-04: originalFilename is a client-supplied File.name — strip characters
// that could break out of the quoted Content-Disposition attribute, and cap
// its length before it is ever echoed back into a response header.
function sanitizeFilenameForHeader(name: string): string {
  return name.replace(/["\r\n]/g, "").slice(0, 255);
}

function isNextRedirectError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) {
    return false;
  }
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  let session: Awaited<ReturnType<typeof verifySession>>;
  try {
    session = await verifySession();
  } catch (err) {
    if (isNextRedirectError(err)) {
      return new Response("Unauthorized", { status: 401 });
    }
    throw err;
  }
  // session is re-validated (isActive + role, live from Postgres) on every
  // single request by verifySession() itself — no caching beyond the
  // per-request React cache() de-dupe already inside dal.ts.
  void session;

  const { versionId } = await params;

  const version = await prisma.documentVersion.findUnique({
    where: { id: versionId },
    include: { document: true },
  });

  // D-10: a soft-deleted document's bytes are never served here — the
  // dedicated "Document deleted." notice lives on the 03-05 viewer page,
  // not this route, so this is a plain 404, not a special message.
  if (!version || version.document.deletedAt) {
    return new Response("Not found", { status: 404 });
  }

  // ACC-04/D-01: every department + Admin can read any open case's
  // documents — no role filter here, matching the case-detail page's
  // access model. Confirm the parent case still exists (defensive; FK
  // guarantees it does).
  const kase = await prisma.case.findUnique({
    where: { id: version.document.caseId },
    select: { id: true },
  });
  if (!kase) {
    return new Response("Not found", { status: 404 });
  }

  const url = new URL(req.url);
  const isDownload = url.searchParams.has("download");

  const range = req.headers.get("range");
  let readResult: Awaited<ReturnType<ReturnType<typeof getStorageAdapter>["readRange"]>>;
  try {
    readResult = await getStorageAdapter().readRange(version.storageKey, range);
  } catch (err) {
    // G-03-2: a missing/deleted storage object (e.g. a hosted-seeded row
    // whose bytes were never uploaded to the bucket) answers a clean 404
    // instead of leaking a generic 500. Any other storage failure (a
    // genuine 401/500) rethrows unchanged.
    if (err instanceof StorageObjectNotFoundError) {
      return new Response("Not found", { status: 404 });
    }
    throw err;
  }
  const { stream, start, end, total, status } = readResult;

  return new Response(stream, {
    status,
    headers: {
      "Content-Type": version.mimeType,
      "Content-Disposition": `${isDownload ? "attachment" : "inline"}; filename="${sanitizeFilenameForHeader(version.originalFilename)}"`,
      "Accept-Ranges": "bytes",
      ...(status === 206
        ? {
            "Content-Range": `bytes ${start}-${end}/${total}`,
            "Content-Length": String(end - start + 1),
          }
        : { "Content-Length": String(total) }),
    },
  });
}
