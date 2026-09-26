import assert from "node:assert/strict";
import { test } from "node:test";

import { withClientTimeout } from "./with-client-timeout";

// G-04-1 (04-04 Task 2): withClientTimeout is upload-dialog.tsx's client-side
// bound on finalizeUpload — same race-with-cleanup shape as
// app/lib/storage/supabase-helpers.ts's withTimeout, kept as a separate
// module (not imported from the server-only helpers file) so it stays
// unit-testable under plain node:test without pulling in the client
// component's react/react-dropzone/Server Action imports.
test("withClientTimeout: rejects within the bound when the promise never settles", async () => {
  const neverResolving = new Promise<never>(() => {});
  await assert.rejects(
    withClientTimeout(neverResolving, 20, "Upload timed out while finalizing — please try again."),
    (err: unknown) =>
      err instanceof Error && err.message === "Upload timed out while finalizing — please try again.",
  );
});

test("withClientTimeout: resolves with the promise's value when it settles before the bound", async () => {
  const result = await withClientTimeout(Promise.resolve("finalized"), 1000, "timed out");
  assert.equal(result, "finalized");
});
