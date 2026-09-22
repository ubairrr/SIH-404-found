import assert from "node:assert/strict";
import { test } from "node:test";

import { buildReadRangeHeaders, resolveSupabaseUrl } from "./supabase-helpers";

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
