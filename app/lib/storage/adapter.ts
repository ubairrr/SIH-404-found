// StorageAdapter interface — Phase 1 scope only.
//
// Phase 1 ships only the interface + env-driven selection (getStorageAdapter);
// no upload UI calls these methods yet. Real wiring into upload/download flows
// is Phase 3's scope. Both implementations (SupabaseStorageAdapter,
// LocalDiskStorageAdapter) are genuine, working code — never stubs that throw
// "not implemented" — so Phase 3 can wire real calls into this same interface
// with zero architectural change.
//
// See .planning/phases/01-login-user-management-tamper-proof-audit-log/01-RESEARCH.md
// Code Examples §3.

import { SupabaseStorageAdapter } from "./supabase";
import { LocalDiskStorageAdapter } from "./local";

// WR-03: distinct error type for storage-layer failures (filesystem paths,
// Supabase bucket/key details) so callers can log the real message
// server-side while returning a generic, non-leaking message to the client.
export class StorageAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageAdapterError";
  }
}

// G-03-2 gap closure: distinct sentinel for "the storage object itself does
// not exist" (a missing/deleted object, or a hosted seed row whose bytes
// were never uploaded) so route handlers can answer a clean 404 instead of
// leaking a generic 500 for what is really a not-found condition.
export class StorageObjectNotFoundError extends StorageAdapterError {
  constructor(message: string) {
    super(message);
    this.name = "StorageObjectNotFoundError";
  }
}

export type RangeReadResult = {
  stream: ReadableStream;
  start: number;
  end: number;
  total: number;
  status: 200 | 206;
};

export interface StorageAdapter {
  putObject(key: string, data: Buffer, contentType: string): Promise<void>;
  getObjectStream(key: string): Promise<ReadableStream>;
  deleteObject(key: string): Promise<void>;
  // D-01: server-side half of the signed direct-upload flow — the server
  // authorizes and hands back a short-lived signed upload target; the
  // browser (03-02/03-04) PUTs bytes straight to storage, and a later
  // finalizeUpload call re-validates before any DB row is created. No
  // Document/DocumentVersion row is ever created here.
  createUploadTarget(key: string): Promise<{ url: string; token?: string }>;
  readLeadingBytes(key: string, byteLength: number): Promise<Buffer>;
  readRange(key: string, rangeHeader: string | null): Promise<RangeReadResult>;
  getObjectSize(key: string): Promise<number>;
  // D-06: exclusive method for version-creating code (document AND evidence
  // alike) — never upsert:true, so no version's bytes can ever be silently
  // replaced. putObject/upsert:true stays untouched for Phase 1 callers.
  putObjectNoOverwrite(key: string, data: Buffer, contentType: string): Promise<void>;
}

export function getStorageAdapter(): StorageAdapter {
  return process.env.STORAGE_DRIVER === "supabase"
    ? new SupabaseStorageAdapter()
    : new LocalDiskStorageAdapter();
}
