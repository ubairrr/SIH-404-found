import assert from "node:assert/strict";
import { test } from "node:test";

import { SupabaseStorageAdapter } from "./supabase";
import type { RangeReadResult } from "./adapter";

function textStream(text: string): ReadableStream {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

test("readLeadingBytes routes through readRange() with a bounded range header", async () => {
  const adapter = new SupabaseStorageAdapter();
  let capturedRangeHeader: string | null = null;

  (adapter as unknown as { readRange: SupabaseStorageAdapter["readRange"] }).readRange = async (
    _key: string,
    rangeHeader: string | null,
  ): Promise<RangeReadResult> => {
    capturedRangeHeader = rangeHeader;
    return {
      stream: textStream("hello world"),
      start: 0,
      end: 4,
      total: 11,
      status: 206,
    };
  };

  const buffer = await adapter.readLeadingBytes("some-key", 5);

  assert.equal(capturedRangeHeader, "bytes=0-4");
  assert.equal(buffer.toString(), "hello");
});

test("getObjectSize routes through readRange() with a minimal 1-byte range header and drains the stream", async () => {
  const adapter = new SupabaseStorageAdapter();
  let capturedRangeHeader: string | null = null;
  let cancelCallCount = 0;

  (adapter as unknown as { readRange: SupabaseStorageAdapter["readRange"] }).readRange = async (
    _key: string,
    rangeHeader: string | null,
  ): Promise<RangeReadResult> => {
    capturedRangeHeader = rangeHeader;
    return {
      stream: {
        cancel: async () => {
          cancelCallCount += 1;
        },
      } as unknown as ReadableStream,
      start: 0,
      end: 0,
      total: 987654,
      status: 206,
    };
  };

  const size = await adapter.getObjectSize("some-key");

  assert.equal(capturedRangeHeader, "bytes=0-0");
  assert.equal(size, 987654);
  assert.equal(cancelCallCount, 1);
});
