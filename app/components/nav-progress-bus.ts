// Phase 05 gap-closure (05-06 Task 1, G-05-7): dependency-free pub-sub (no
// react/next imports, same isolation convention as nav-click-eligibility.ts)
// letting non-anchor pending-state UI (e.g. the case-detail tab bar's
// useTransition click) arm NavigationProgress's bar without going through
// the document click-listener's anchor-only isEligibleNavClick guard. This
// is an additive trigger path — it never loosens that guard.
const listeners = new Set<() => void>();

export function subscribeNavProgressStart(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function startNavProgress(): void {
  for (const listener of listeners) {
    listener();
  }
}
