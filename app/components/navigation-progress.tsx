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

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const prevKey = useRef(pathname + searchParams.toString());

  useEffect(() => {
    const key = pathname + searchParams.toString();
    if (key !== prevKey.current) {
      prevKey.current = key;
      setVisible(false); // navigation resolved
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (
        anchor &&
        anchor.href &&
        anchor.origin === window.location.origin &&
        !anchor.hasAttribute("download")
      ) {
        setVisible(true);
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return (
    <div
      aria-hidden
      className={`nav-progress-bar ${visible ? "is-visible" : ""}`}
    />
  );
}
