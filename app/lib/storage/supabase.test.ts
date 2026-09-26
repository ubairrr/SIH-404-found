import assert from "node:assert/strict";
import { test } from "node:test";

import { SupabaseStorageAdapter } from "./supabase";
import type { RangeReadResult } from "./adapter";

// Tests below (real fetch() path) construct a real SupabaseStorageAdapter,
// which resolves these env vars at call time — set fixed test values so the
// tests don't depend on a real .env file being present.
process.env.SUPABASE_URL ??= "https://test-project.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

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

// G-04-1 (04-04 Task 1): the tests above stub readRange() itself — they never
// exercise the real fetch() path inside readRange, which is exactly what hid
// the hosted hang (the debug session found no test ever drove a real 206,
// 200, or 416 response through this code). These tests mock global.fetch
// directly instead.

function mockJsonHeaders(entries: Record<string, string>) {
  return {
    get(name: string) {
      return entries[name.toLowerCase()] ?? null;
    },
  } as unknown as Headers;
}

function bodyStream(bytes: Uint8Array): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

test("readLeadingBytes: real fetch() 206 clamped response resolves to the object's full (shorter) content", async () => {
  const originalFetch = global.fetch;
  const bytes = new TextEncoder().encode("x".repeat(606));
  global.fetch = (async () =>
    ({
      status: 206,
      ok: true,
      headers: mockJsonHeaders({
        "content-range": "bytes 0-605/606",
        "content-length": "606",
      }),
      body: bodyStream(bytes),
    }) as unknown as Response) as unknown as typeof fetch;

  try {
    const adapter = new SupabaseStorageAdapter();
    const buffer = await adapter.readLeadingBytes("some-key", 4100);
    assert.equal(buffer.length, 606);
  } finally {
    global.fetch = originalFetch;
  }
});

test("readLeadingBytes: real fetch() 200 (Range ignored) resolves to the same full content", async () => {
  const originalFetch = global.fetch;
  const bytes = new TextEncoder().encode("x".repeat(606));
  global.fetch = (async () =>
    ({
      status: 200,
      ok: true,
      headers: mockJsonHeaders({ "content-length": "606" }),
      body: bodyStream(bytes),
    }) as unknown as Response) as unknown as typeof fetch;

  try {
    const adapter = new SupabaseStorageAdapter();
    const buffer = await adapter.readLeadingBytes("some-key", 4100);
    assert.equal(buffer.length, 606);
  } finally {
    global.fetch = originalFetch;
  }
});

test("readLeadingBytes: real fetch() 416 retries once with a corrected Range and succeeds", async () => {
  const originalFetch = global.fetch;
  const bytes = new TextEncoder().encode("x".repeat(606));
  const capturedRanges: (string | null)[] = [];
  let callCount = 0;
  global.fetch = (async (_url: string, init?: { headers?: Record<string, string> }) => {
    callCount += 1;
    capturedRanges.push(init?.headers?.Range ?? null);
    if (callCount === 1) {
      return {
        status: 416,
        ok: false,
        headers: mockJsonHeaders({ "content-range": "bytes */606" }),
        body: bodyStream(new Uint8Array(0)),
      } as unknown as Response;
    }
    return {
      status: 206,
      ok: true,
      headers: mockJsonHeaders({
        "content-range": "bytes 0-605/606",
        "content-length": "606",
      }),
      body: bodyStream(bytes),
    } as unknown as Response;
  }) as unknown as typeof fetch;

  try {
    const adapter = new SupabaseStorageAdapter();
    const buffer = await adapter.readLeadingBytes("some-key", 4100);
    assert.equal(buffer.length, 606);
    assert.equal(capturedRanges[0], "bytes=0-4099");
    assert.equal(capturedRanges[1], "bytes=0-605");
  } finally {
    global.fetch = originalFetch;
  }
});

test("readLeadingBytes: real fetch() 416 for an empty object resolves to a zero-length Buffer with no retry", async () => {
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = (async () => {
    callCount += 1;
    return {
      status: 416,
      ok: false,
      headers: mockJsonHeaders({ "content-range": "bytes */0" }),
      body: bodyStream(new Uint8Array(0)),
    } as unknown as Response;
  }) as unknown as typeof fetch;

  try {
    const adapter = new SupabaseStorageAdapter();
    const buffer = await adapter.readLeadingBytes("some-key", 4100);
    assert.equal(buffer.length, 0);
    assert.equal(callCount, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test("readLeadingBytes: a fetch() that never settles is bounded by a real timeout (fake timers)", { timeout: 2000 }, async (t) => {
  const originalFetch = global.fetch;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  global.fetch = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;

  try {
    const adapter = new SupabaseStorageAdapter();
    const pending = adapter.readLeadingBytes("some-key", 4100);
    const assertion = assert.rejects(
      pending,
      (err: unknown) =>
        err instanceof Error &&
        err.name === "StorageAdapterError" &&
        err.message.includes("timed out waiting for a response"),
    );
    await t.mock.timers.tick(15000);
    await assertion;
  } finally {
    global.fetch = originalFetch;
    t.mock.timers.reset();
  }
});

test("readLeadingBytes: a never-closing response body is bounded by a separate drain timeout (fake timers)", { timeout: 2000 }, async (t) => {
  const originalFetch = global.fetch;
  t.mock.timers.enable({ apis: ["setTimeout"] });

  let cancelCallCount = 0;
  const neverClosingStream = new ReadableStream({
    start() {
      // Intentionally never enqueue or close — simulates a response body
      // that never finishes draining.
    },
  });
  const originalCancel = neverClosingStream.cancel.bind(neverClosingStream);
  neverClosingStream.cancel = (async (...args: unknown[]) => {
    cancelCallCount += 1;
    return originalCancel(...(args as []));
  }) as typeof neverClosingStream.cancel;

  global.fetch = (async () =>
    ({
      status: 206,
      ok: true,
      headers: mockJsonHeaders({
        "content-range": "bytes 0-605/606",
        "content-length": "606",
      }),
      body: neverClosingStream,
    }) as unknown as Response) as unknown as typeof fetch;

  try {
    const adapter = new SupabaseStorageAdapter();
    const pending = adapter.readLeadingBytes("some-key", 4100);
    const assertion = assert.rejects(
      pending,
      (err: unknown) =>
        err instanceof Error &&
        err.name === "StorageAdapterError" &&
        err.message.includes("timed out draining the response body"),
    );
    await t.mock.timers.tick(15000);
    await assertion;
    assert.equal(cancelCallCount, 1);
  } finally {
    global.fetch = originalFetch;
    t.mock.timers.reset();
  }
});
