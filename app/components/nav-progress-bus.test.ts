import assert from "node:assert/strict";
import { test } from "node:test";

import { startNavProgress, subscribeNavProgressStart } from "./nav-progress-bus";

// Phase 05 gap-closure (05-06 Task 1, G-05-7): covers the pub-sub contract
// nav-progress-bus.ts must satisfy so NavigationProgress can arm its bar via
// an additive programmatic trigger (see nav-progress-bus.ts header comment).

test("a single subscribed listener is called once when startNavProgress() is called", () => {
  let calls = 0;
  const unsubscribe = subscribeNavProgressStart(() => {
    calls += 1;
  });
  startNavProgress();
  assert.equal(calls, 1);
  unsubscribe();
});

test("two subscribed listeners are both called on one startNavProgress() call", () => {
  let firstCalls = 0;
  let secondCalls = 0;
  const unsubscribeFirst = subscribeNavProgressStart(() => {
    firstCalls += 1;
  });
  const unsubscribeSecond = subscribeNavProgressStart(() => {
    secondCalls += 1;
  });
  startNavProgress();
  assert.equal(firstCalls, 1);
  assert.equal(secondCalls, 1);
  unsubscribeFirst();
  unsubscribeSecond();
});

test("calling the returned unsubscribe function prevents further calls", () => {
  let calls = 0;
  const unsubscribe = subscribeNavProgressStart(() => {
    calls += 1;
  });
  unsubscribe();
  startNavProgress();
  assert.equal(calls, 0);
});

test("calling startNavProgress() with zero subscribers does not throw", () => {
  assert.doesNotThrow(() => {
    startNavProgress();
  });
});
