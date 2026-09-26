"use client";

// Phase 05 (05-01): global navigation-progress bar. App Router exposes no
// router.events-equivalent lifecycle API (05-RESEARCH.md Pattern 3), so
// this observes navigation via a document-level click listener (start
// signal) plus usePathname/useSearchParams change-detection (done signal).
// It must NEVER call preventDefault() or otherwise intercept the click —
// it only observes (05-RESEARCH.md Anti-Pattern, threat T-05-01).
//
// Security guard (threat T-05-03 / 05-PATTERNS.md Security Domain note):
// only starts the bar for a same-origin anchor click that is not a
// download link — otherwise it would show a spurious "navigating…" bar
// for MediaPreview's `<a href={downloadUrl} download>` evidence-file
// downloads, which never navigate away from the current page.
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { isEligibleNavClick } from "./nav-click-eligibility";

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const prevKey = useRef(pathname + searchParams.toString());
  // 05-05 (CR-01 / LOAD-02): bounds a stuck bar to 8s regardless of cause
  // (modifier/middle/target=_blank/same-URL clicks the eligibility guard
  // below already screens out, plus any navigation that never resolves).
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const key = pathname + searchParams.toString();
    if (key !== prevKey.current) {
      prevKey.current = key;
      setVisible(false); // navigation resolved
      if (safetyTimer.current) {
        clearTimeout(safetyTimer.current);
        safetyTimer.current = null;
      }
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a");
      const eligible = isEligibleNavClick({
        button: e.button,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        defaultPrevented: e.defaultPrevented,
        anchorHref: anchor?.href ?? null,
        anchorOrigin: anchor?.origin ?? null,
        anchorTarget: anchor?.target ?? null,
        hasDownloadAttr: anchor?.hasAttribute("download") ?? false,
        currentOrigin: window.location.origin,
        currentHref: window.location.href,
      });
      if (eligible) {
        setVisible(true);
        if (safetyTimer.current) {
          clearTimeout(safetyTimer.current);
        }
        safetyTimer.current = setTimeout(() => setVisible(false), 8000);
      }
    }
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
      if (safetyTimer.current) {
        clearTimeout(safetyTimer.current);
      }
    };
  }, []);

  return (
    <div
      aria-hidden
      className={`nav-progress-bar ${visible ? "is-visible" : ""}`}
    />
  );
}
