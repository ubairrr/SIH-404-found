import "server-only";

import { createClient } from "@supabase/supabase-js";

import {
  StorageAdapterError,
  StorageObjectNotFoundError,
  type RangeReadResult,
  type StorageAdapter,
} from "./adapter";
// Re-exported for backward compatibility with any existing import sites;
// the real implementation lives in supabase-helpers.ts (no "server-only"
// import) so it can be unit-tested under plain `node --import tsx --test`
// without tripping this file's own server-only guard above.
import { buildReadRangeHeaders } from "./supabase-helpers";

export { buildReadRangeHeaders };

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
      process.env.SUPABASE_URL!,
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
      throw new StorageAdapterError(
        `SupabaseStorageAdapter.createUploadTarget failed for "${key}": ${error?.message ?? "no data returned"}`,
      );
    }

    return { url: data.signedUrl, token: data.token };
  }

  async readLeadingBytes(key: string, byteLength: number): Promise<Buffer> {
    const { data, error } = await this.client().storage.from(BUCKET).download(key);

    if (error || !data) {
      throw new StorageAdapterError(
        `SupabaseStorageAdapter.readLeadingBytes failed for "${key}": ${error?.message ?? "no data returned"}`,
      );
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    return buffer.subarray(0, byteLength);
  }

  async getObjectSize(key: string): Promise<number> {
    const { data, error } = await this.client().storage.from(BUCKET).download(key);

    if (error || !data) {
      throw new StorageAdapterError(
        `SupabaseStorageAdapter.getObjectSize failed for "${key}": ${error?.message ?? "no data returned"}`,
      );
    }

    return data.size;
  }

  // RESEARCH.md Open Question 2: `.download()` does not expose a Range
  // passthrough, so a true partial read requires a direct authenticated
  // fetch() against the Storage REST object endpoint with the incoming
  // Range header forwarded verbatim (T-03-01: the header value only ever
  // originates from the current request's own Range header — the key/path
  // is always server-generated, never client-controlled).
  async readRange(key: string, rangeHeader: string | null): Promise<RangeReadResult> {
    const url = `${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`;
    const headers = buildReadRangeHeaders(
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      rangeHeader,
    );

    const response = await fetch(url, { headers });
    if (response.status === 400 || response.status === 404) {
      // G-03-2 (revised): Supabase's Storage REST gateway answers a missing
      // object with either a 404 or a 400 "not_found" body — map both to
      // the not-found sentinel so the route handler can return a clean 404
      // instead of a generic 500 for what is really a not-found condition.
      throw new StorageObjectNotFoundError(`Object not found for "${key}"`);
    }
    if (!response.ok && response.status !== 206) {
      throw new StorageAdapterError(
        `SupabaseStorageAdapter.readRange failed for "${key}": HTTP ${response.status}`,
      );
    }
    if (!response.body) {
      throw new StorageAdapterError(`SupabaseStorageAdapter.readRange failed for "${key}": no response body`);
    }

    const contentRange = response.headers.get("content-range");
    const contentLength = Number.parseInt(response.headers.get("content-length") ?? "0", 10);

    let start = 0;
    let end = contentLength - 1;
    let total = contentLength;
    if (contentRange) {
      // Format: "bytes start-end/total"
      const match = contentRange.match(/bytes (\d+)-(\d+)\/(\d+)/);
      if (match) {
        start = Number.parseInt(match[1], 10);
        end = Number.parseInt(match[2], 10);
        total = Number.parseInt(match[3], 10);
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
