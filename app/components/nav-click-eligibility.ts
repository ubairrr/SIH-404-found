// Phase 05 gap-closure (05-05 Task 1, CR-01 / LOAD-02): dependency-free
// predicate (no react/next imports) deciding whether a document-level click
// should be treated as an "eligible" same-page navigation for
// NavigationProgress's start signal — same isolation convention as
// with-client-timeout.ts, kept independently unit-testable under plain
// node:test.
export function isEligibleNavClick(input: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  anchorHref: string | null;
  anchorOrigin: string | null;
  anchorTarget: string | null;
  hasDownloadAttr: boolean;
  currentOrigin: string;
  currentHref: string;
}): boolean {
  if (input.defaultPrevented) return false;
  if (input.button !== 0) return false;
  if (input.metaKey || input.ctrlKey || input.shiftKey || input.altKey) {
    return false;
  }
  if (input.anchorHref === null) return false;
  if (input.anchorTarget === "_blank") return false;
  if (input.hasDownloadAttr) return false;
  if (input.anchorOrigin !== input.currentOrigin) return false;
  if (input.anchorHref === input.currentHref) return false;
  return true;
}
