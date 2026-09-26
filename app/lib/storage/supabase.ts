import "server-only";

import { createClient } from "@supabase/supabase-js";

import {
  StorageAdapterError,
  StorageObjectNotFoundError,
  type RangeReadResult,
  type StorageAdapter,
} from "./adapter";
// Re-exported for backward compatibility with any existing import sites;
// the real implementations live in supabase-helpers.ts (no "server-only"
// import) so they can be unit-tested under plain `node --import tsx --test`
// without tripping this file's own server-only guard above.
import {
  buildReadRangeHeaders,
  resolveSupabaseUrl as resolveSupabaseUrlPure,
  parseContentRange,
  withTimeout,
} from "./supabase-helpers";

// G-04-1 (04-04): bounds for the fetch-header-wait and body-drain stages of
// readRange/readLeadingBytes — see the class methods below for exactly what
// each one bounds and why (T-04-08).
const FETCH_TIMEOUT_MS = 15000;
const BODY_DRAIN_TIMEOUT_MS = 15000;

export { buildReadRangeHeaders };
export { resolveSupabaseUrl } from "./supabase-helpers";

// Wraps the pure resolveSupabaseUrl so a malformed SUPABASE_URL always
// surfaces as a StorageAdapterError (never a bare Error) — requestUpload's
// catch block only masks StorageAdapterError with the generic client
// message; any other Error type is returned to the client verbatim.
function resolveConfiguredSupabaseUrl(): string {
  try {
    return resolveSupabaseUrlPure(process.env.SUPABASE_URL);
  } catch (err) {
    throw new StorageAdapterError((err as Error).message);
  }
}

// SupabaseStorageAdapter — hosted-mode implementation.
//
// Uses the service-role key server-side only (T-04-03). No client component
// in this phase imports this module — `import "server-only"` above turns any
// future accidental client import into a build-time error.
//
// Real, working wrapper around the @supabase/supabase-js Storage SDK — no
// upload UI calls this yet (that's Phase 3), but the adapter itself must be
// genuine code, never a stub that throws "not implemented".
const BUCKET = "casevault-files";

export class SupabaseStorageAdapter implements StorageAdapter {
  private client() {
    return createClient(
      resolveConfiguredSupabaseUrl(),
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }

  async putObject(key: string, data: Buffer, contentType: string): Promise<void> {
    const { error } = await this.client()
      .storage.from(BUCKET)
      .upload(key, data, { contentType, upsert: true });

    if (error) {
      throw new StorageAdapterError(`SupabaseStorageAdapter.putObject failed for "${key}": ${error.message}`);
    }
  }

  async getObjectStream(key: string): Promise<ReadableStream> {
    const { data, error } = await this.client().storage.from(BUCKET).download(key);

    if (error || !data) {
      throw new StorageAdapterError(
        `SupabaseStorageAdapter.getObjectStream failed for "${key}": ${error?.message ?? "no data returned"}`,
      );
    }

    return data.stream();
  }

  async deleteObject(key: string): Promise<void> {
    const { error } = await this.client().storage.from(BUCKET).remove([key]);

    if (error) {
      throw new StorageAdapterError(`SupabaseStorageAdapter.deleteObject failed for "${key}": ${error.message}`);
    }
  }

  // D-01: server side of the signed direct-upload flow. The browser
  // (03-02/03-04) PUTs bytes straight to `url` using `token`; no
  // Document/DocumentVersion row is created here — that happens in a later
  // finalizeUpload call that re-validates the uploaded object.
  async createUploadTarget(key: string): Promise<{ url: string; token?: string }> {
    const { data, error } = await this.client()
      .storage.from(BUCKET)
      .createSignedUploadUrl(key);

    if (error || !data) {
      // G-03-1 diagnosability: include the SDK error's status (when present)
      // alongside its message so the real cause reaches requestUpload's
      // console.error() below — never returned to the client verbatim,
      // StorageAdapterError messages only ever surface as the fixed generic
      // string outside this module.
      const status = (error as { status?: number } | null)?.status;
      throw new StorageAdapterError(
        `SupabaseStorageAdapter.createUploadTarget failed for "${key}": ${error?.message ?? "no data returned"}${status !== undefined ? ` (status ${status})` : ""}`,
      );
    }

    return { url: data.signedUrl, token: data.token };
  }

  // T-03-08 / D-16 fix: hosted-mode magic-byte sniffing must never buffer the
  // whole object via .download() — a large video upload would load its full
  // bytes into memory just to inspect a handful of leading bytes. Reuses the
  // already-tested readRange() ranged-GET path (RESEARCH.md Open Question 1:
  // resolved via the already-tested bytes=0-0 ranged-GET through readRange()
  // rather than a new, untested HEAD-request code path, per the researcher's
  // explicit recommendation to avoid a third untested fetch path).
  async readLeadingBytes(key: string, byteLength: number): Promise<Buffer> {
    const { stream } = await this.readRange(key, `bytes=0-${byteLength - 1}`);

    let arrayBuffer: ArrayBuffer;
    try {
      // G-04-1 (04-04) / T-04-08: bounds the body drain separately from the
      // fetch-header-wait bound inside readRange — a gateway that answers
      // headers promptly but then never finishes streaming the body would
      // otherwise hang here indefinitely. Scoped to this small-sniff caller
      // only: the /api/files ranged-streaming route consumes readRange's
      // returned stream directly and is never subject to this bound.
      arrayBuffer = await withTimeout(
        new Response(stream).arrayBuffer(),
        BODY_DRAIN_TIMEOUT_MS,
        `SupabaseStorageAdapter.readLeadingBytes timed out draining the response body for "${key}"`,
      );
    } catch (err) {
      await stream.cancel().catch(() => {});
      if (err instanceof StorageAdapterError) throw err;
      throw new StorageAdapterError((err as Error).message);
    }

    const buffer = Buffer.from(arrayBuffer);
    return buffer.subarray(0, byteLength);
  }

  // See readLeadingBytes comment above: same T-03-08 / D-16 fix. Only a
  // minimal 1-byte ranged request is issued to discover the object's total
  // size from the Content-Range response — the unused 1-byte response body
  // is explicitly drained via stream.cancel() before returning (Pitfall 3 —
  // an undrained fetch response body can hold a connection open under load).
  async getObjectSize(key: string): Promise<number> {
    const { stream, total } = await this.readRange(key, "bytes=0-0");
    await stream.cancel();
    return total;
  }

  // RESEARCH.md Open Question 2: `.download()` does not expose a Range
  // passthrough, so a true partial read requires a direct authenticated
  // fetch() against the Storage REST object endpoint with the incoming
  // Range header forwarded verbatim (T-03-01: the header value only ever
  // originates from the current request's own Range header — the key/path
  // is always server-generated, never client-controlled).
  // G-04-1 (04-04) / T-04-08: wraps the raw fetch() in a bounded wait for a
  // response. Uses Promise.race (not solely an AbortController-triggered
  // rejection) so the bound fires even against an upstream that never
  // answers headers at all — aborting the controller is still done as a
  // best-effort real-world cleanup, but the timeout itself is guaranteed by
  // the race, not by the abort causing fetch() to reject. Cleared on either
  // settle path so it never keeps the process alive or fires after the real
  // result is already known.
  private fetchWithTimeout(
    url: string,
    headers: Record<string, string>,
    key: string,
  ): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error("timed out waiting for a response"));
      }, FETCH_TIMEOUT_MS);
      const maybeUnref = (timer as unknown as { unref?: () => void }).unref;
      if (typeof maybeUnref === "function") {
        maybeUnref.call(timer);
      }
    });

    return Promise.race([fetch(url, { headers, signal: controller.signal }), timeoutPromise]).then(
      (response) => {
        clearTimeout(timer);
        return response;
      },
      (err) => {
        clearTimeout(timer);
        if (timedOut) {
          throw new StorageAdapterError(
            `SupabaseStorageAdapter.readRange timed out waiting for a response for "${key}"`,
          );
        }
        throw new StorageAdapterError(
          `SupabaseStorageAdapter.readRange failed for "${key}": ${(err as Error).message}`,
        );
      },
    );
  }

  // G-04-1 (04-04): the actual over-range-request-robust implementation.
  // readRange calls this with retriesLeft=1 — a single corrected retry on a
  // 416, per T-04-09 (the corrected range is derived only from the Storage
  // REST response's own reported size, never client input).
  private async fetchRangeWithRetry(
    key: string,
    rangeHeader: string | null,
    retriesLeft: number,
  ): Promise<RangeReadResult> {
    const url = `${resolveConfiguredSupabaseUrl()}/storage/v1/object/${BUCKET}/${key}`;
    const headers = buildReadRangeHeaders(process.env.SUPABASE_SERVICE_ROLE_KEY!, rangeHeader);

    const response = await this.fetchWithTimeout(url, headers, key);

    if (response.status === 400 || response.status === 404) {
      // G-03-2 (revised): Supabase's Storage REST gateway answers a missing
      // object with either a 404 or a 400 "not_found" body — map both to
      // the not-found sentinel so the route handler can return a clean 404
      // instead of a generic 500 for what is really a not-found condition.
      throw new StorageObjectNotFoundError(`Object not found for "${key}"`);
    }

    if (response.status === 416) {
      // G-04-1: an over-range Range request (e.g. bytes=0-4099 against a
      // smaller object) can come back as a 416 with Content-Range:
      // "bytes */N" instead of a clamped 206 or a Range-ignoring 200. Drain
      // the (empty) body, parse N, and retry once with a corrected,
      // satisfiable range.
      await response.body?.cancel().catch(() => {});
      const parsed = parseContentRange(response.headers.get("content-range"));

      if (parsed && parsed.total === 0) {
        return {
          stream: new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
          start: 0,
          end: -1,
          total: 0,
          status: 200,
        };
      }

      if (retriesLeft > 0 && parsed && parsed.total > 0) {
        return this.fetchRangeWithRetry(key, `bytes=0-${parsed.total - 1}`, retriesLeft - 1);
      }

      throw new StorageAdapterError(
        `SupabaseStorageAdapter.readRange failed for "${key}": 416 Range Not Satisfiable and could not recover a retryable range`,
      );
    }

    if (!response.ok && response.status !== 206) {
      throw new StorageAdapterError(
        `SupabaseStorageAdapter.readRange failed for "${key}": HTTP ${response.status}`,
      );
    }
    if (!response.body) {
      throw new StorageAdapterError(`SupabaseStorageAdapter.readRange failed for "${key}": no response body`);
    }

    const contentLength = Number.parseInt(response.headers.get("content-length") ?? "0", 10);
    const parsed = parseContentRange(response.headers.get("content-range"));

    let start = 0;
    let end = contentLength - 1;
    let total = contentLength;
    if (parsed) {
      total = parsed.total;
      if (parsed.start !== null && parsed.end !== null) {
        start = parsed.start;
        end = parsed.end;
      }
    }

    return {
      stream: response.body,
      start,
      end,
      total,
      status: response.status === 206 ? 206 : 200,
    };
  }

  async readRange(key: string, rangeHeader: string | null): Promise<RangeReadResult> {
    return this.fetchRangeWithRetry(key, rangeHeader, 1);
  }

  // D-06: exclusive method for version-creating code (document AND evidence
  // alike) — never upsert:true, so no version's storage object is ever
  // overwritten. putObject's existing upsert:true behavior is untouched for
  // Phase 1 callers.
  async putObjectNoOverwrite(key: string, data: Buffer, contentType: string): Promise<void> {
    const { error } = await this.client()
      .storage.from(BUCKET)
      .upload(key, data, { contentType, upsert: false });

    if (error) {
      throw new StorageAdapterError(
        `SupabaseStorageAdapter.putObjectNoOverwrite failed for "${key}": ${error.message}`,
      );
    }
  }
}
