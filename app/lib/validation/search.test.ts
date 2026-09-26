import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeInclusiveIstRange,
  hasReversedDateRange,
  searchParamsSchema,
} from "./search";

// Test 1: IST late-evening createdAt boundary — the `to` upper bound must be
// computed as IST 23:59:59.999, not naive UTC midnight (RESEARCH.md Pitfall 1).
test("computeInclusiveIstRange: to= produces the IST end-of-day UTC instant", () => {
  const range = computeInclusiveIstRange(undefined, "2026-09-24");
  assert.equal(range.lte?.toISOString(), "2026-09-24T18:29:59.999Z");
  assert.equal(range.gte, undefined);
});

// Test 2: from= produces the IST start-of-day UTC instant.
test("computeInclusiveIstRange: from= produces the IST start-of-day UTC instant", () => {
  const range = computeInclusiveIstRange("2026-09-20", undefined);
  assert.equal(range.gte?.toISOString(), "2026-09-19T18:30:00.000Z");
  assert.equal(range.lte, undefined);
});

// Test 3: neither boundary supplied — empty range.
test("computeInclusiveIstRange: no input returns an empty range", () => {
  const range = computeInclusiveIstRange(undefined, undefined);
  assert.deepEqual(range, {});
});

// Test 4: malformed stage is dropped via .catch(), never thrown.
test("searchParamsSchema: a malformed stage value is dropped, not thrown", () => {
  const parsed = searchParamsSchema.parse({ stage: "NOT_A_STAGE" });
  assert.equal(parsed.stage, undefined);
  assert.equal(parsed.page, 1);
});

// Test 5: malformed date and page are both dropped independently.
test("searchParamsSchema: malformed date/page are dropped independently", () => {
  const parsed = searchParamsSchema.parse({ from: "not-a-date", page: "abc" });
  assert.equal(parsed.from, undefined);
  assert.equal(parsed.page, 1);
});

// Test 6: happy path round-trips every field, page coerced to a number.
test("searchParamsSchema: valid input round-trips unchanged/coerced", () => {
  const parsed = searchParamsSchema.parse({
    q: "kot/2026",
    stage: "IN_COURT",
    from: "2026-08-01",
    to: "2026-09-25",
    page: "3",
  });
  assert.equal(parsed.q, "kot/2026");
  assert.equal(parsed.stage, "IN_COURT");
  assert.equal(parsed.from, "2026-08-01");
  assert.equal(parsed.to, "2026-09-25");
  assert.equal(parsed.page, 3);
  assert.equal(typeof parsed.page, "number");
});

// Task 3 behavior: hasReversedDateRange returns true only when both are
// defined and from > to; false when either is undefined or equal.
test("hasReversedDateRange: true only when both defined and from > to", () => {
  const from = new Date("2026-09-25T00:00:00.000Z");
  const to = new Date("2026-09-20T00:00:00.000Z");
  assert.equal(hasReversedDateRange(from, to), true);
});

test("hasReversedDateRange: false when either boundary is undefined", () => {
  const from = new Date("2026-09-25T00:00:00.000Z");
  assert.equal(hasReversedDateRange(from, undefined), false);
  assert.equal(hasReversedDateRange(undefined, from), false);
  assert.equal(hasReversedDateRange(undefined, undefined), false);
});

test("hasReversedDateRange: false when from equals to", () => {
  const same = new Date("2026-09-25T00:00:00.000Z");
  assert.equal(hasReversedDateRange(same, same), false);
});
