import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildReadRangeHeaders,
  resolveSupabaseUrl,
  parseContentRange,
  withTimeout,
} from "./supabase-helpers";

test("buildReadRangeHeaders without a Range header", () => {
  const headers = buildReadRangeHeaders("k", null);
  assert.deepEqual(headers, { apikey: "k", Authorization: "Bearer k" });
});

test("buildReadRangeHeaders with a Range header", () => {
  const headers = buildReadRangeHeaders("k", "bytes=0-10");
  assert.deepEqual(headers, {
    apikey: "k",
    Authorization: "Bearer k",
    Range: "bytes=0-10",
  });
});

test("resolveSupabaseUrl: bare origin is unchanged", () => {
  assert.equal(resolveSupabaseUrl("https://x.supabase.co"), "https://x.supabase.co");
});

test("resolveSupabaseUrl: trailing slash is normalized away", () => {
  assert.equal(resolveSupabaseUrl("https://x.supabase.co/"), "https://x.supabase.co");
});

test("resolveSupabaseUrl: surrounding whitespace is trimmed", () => {
  assert.equal(resolveSupabaseUrl("  https://x.supabase.co  "), "https://x.supabase.co");
});

test("resolveSupabaseUrl: a /rest/v1 path throws", () => {
  assert.throws(() => resolveSupabaseUrl("https://x.supabase.co/rest/v1"));
});

test("resolveSupabaseUrl: a /storage/v1/s3 path throws", () => {
  assert.throws(() => resolveSupabaseUrl("https://x.supabase.co/storage/v1/s3"));
});

test("resolveSupabaseUrl: undefined throws", () => {
  assert.throws(() => resolveSupabaseUrl(undefined));
});

// G-04-1 (04-04 Task 1): parseContentRange must handle both the satisfied
// ("bytes start-end/total") and unsatisfied ("bytes */total") Content-Range
// shapes Supabase Storage can return for a Range request, plus reject
// anything else (missing header, garbage) as null rather than throwing.
test("parseContentRange: satisfied range shape", () => {
  assert.deepEqual(parseContentRange("bytes 0-605/606"), {
    start: 0,
    end: 605,
    total: 606,
  });
});

test("parseContentRange: unsatisfied range shape (416)", () => {
  assert.deepEqual(parseContentRange("bytes */606"), {
    start: null,
    end: null,
    total: 606,
  });
});

test("parseContentRange: null header returns null", () => {
  assert.equal(parseContentRange(null), null);
});

test("parseContentRange: garbage header returns null", () => {
  assert.equal(parseContentRange("garbage"), null);
});

// withTimeout: races a promise against a bounded timeout, rejecting with a
// plain Error carrying the caller's message when the timeout wins.
test("withTimeout: rejects within the bound when the promise never settles", async () => {
  const neverResolving = new Promise<never>(() => {});
  await assert.rejects(
    withTimeout(neverResolving, 20, "timed out"),
    (err: unknown) => err instanceof Error && err.message === "timed out",
  );
});

test("withTimeout: resolves with the promise's value when it settles before the bound", async () => {
  const result = await withTimeout(Promise.resolve("ok"), 1000, "timed out");
  assert.equal(result, "ok");
});
