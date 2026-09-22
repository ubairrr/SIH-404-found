import assert from "node:assert/strict";
import { test } from "node:test";

import { buildReadRangeHeaders } from "./supabase-helpers";

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
