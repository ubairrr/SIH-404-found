import assert from "node:assert/strict";
import { test } from "node:test";

import { isEligibleNavClick } from "./nav-click-eligibility";

// Phase 05 gap-closure (05-05 Task 1, CR-01 / LOAD-02): isEligibleNavClick
// gates NavigationProgress's setVisible(true) call — these cases cover every
// bespoke prohibition 05-REVIEW.md/05-VERIFICATION.md called out (modifier
// clicks, middle-click, target="_blank", download links, cross-origin,
// same-URL, no-anchor, and an already-intercepted click).
const base = {
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
  anchorHref: "https://example.test/next",
  anchorOrigin: "https://example.test",
  anchorTarget: null,
  hasDownloadAttr: false,
  currentOrigin: "https://example.test",
  currentHref: "https://example.test/current",
};

test("plain left-click, same-origin, different URL is eligible", () => {
  assert.equal(isEligibleNavClick(base), true);
});

test("metaKey click is not eligible", () => {
  assert.equal(isEligibleNavClick({ ...base, metaKey: true }), false);
});

test("ctrlKey click is not eligible", () => {
  assert.equal(isEligibleNavClick({ ...base, ctrlKey: true }), false);
});

test("shiftKey click is not eligible", () => {
  assert.equal(isEligibleNavClick({ ...base, shiftKey: true }), false);
});

test("altKey click is not eligible", () => {
  assert.equal(isEligibleNavClick({ ...base, altKey: true }), false);
});

test("middle-click (button 1) is not eligible", () => {
  assert.equal(isEligibleNavClick({ ...base, button: 1 }), false);
});

test("target=_blank anchor is not eligible", () => {
  assert.equal(isEligibleNavClick({ ...base, anchorTarget: "_blank" }), false);
});

test("download attribute anchor is not eligible", () => {
  assert.equal(isEligibleNavClick({ ...base, hasDownloadAttr: true }), false);
});

test("cross-origin anchor is not eligible", () => {
  assert.equal(
    isEligibleNavClick({ ...base, anchorOrigin: "https://other.test" }),
    false,
  );
});

test("same-URL anchor (href === current href) is not eligible", () => {
  assert.equal(
    isEligibleNavClick({ ...base, anchorHref: base.currentHref }),
    false,
  );
});

test("no ancestor anchor (anchorHref null) is not eligible", () => {
  assert.equal(isEligibleNavClick({ ...base, anchorHref: null }), false);
});

test("already-intercepted click (defaultPrevented) is not eligible", () => {
  assert.equal(
    isEligibleNavClick({ ...base, defaultPrevented: true }),
    false,
  );
});
