"use client";

import { useEffect, useRef } from "react";

const SCROLL_PREFIX = "poltr.scroll:";
const NAV_COUNTER_KEY = "poltr.navCounter";

type RouterLike = {
  back: () => void;
  push: (path: string) => void;
};

function stampHistoryEntry(): void {
  if (typeof window === "undefined") return;
  const state = window.history.state;
  if (state?.scrollKey) return;

  const idx = Number(window.sessionStorage.getItem(NAV_COUNTER_KEY) || "0");
  window.sessionStorage.setItem(NAV_COUNTER_KEY, String(idx + 1));

  const scrollKey = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;

  window.history.replaceState(
    { ...(state || {}), scrollKey, poltrIdx: idx },
    "",
  );
}

function getScrollKey(): string | null {
  if (typeof window === "undefined") return null;
  return window.history.state?.scrollKey ?? null;
}

function getPoltrIdx(): number {
  if (typeof window === "undefined") return 0;
  const v = window.history.state?.poltrIdx;
  return typeof v === "number" ? v : 0;
}

export function smartBack(router: RouterLike, fallback: string): void {
  if (getPoltrIdx() > 0) {
    router.back();
  } else {
    router.push(fallback);
  }
}

/**
 * Saves window scroll position per history entry (keyed by a stable id we
 * write into history.state). When `ready` flips to true, restores the saved
 * position for the current entry.
 *
 * Multiple navigation hops (e.g. ballot → argA → child argB → child argC)
 * each get their own history entry with its own scrollKey, so back-button
 * presses restore scroll at every level.
 */
export function useScrollRestore(ready: boolean): void {
  const restoredRef = useRef(false);

  // Stamp the current history entry once per mount.
  useEffect(() => {
    stampHistoryEntry();
  }, []);

  // Persist scroll position while the user scrolls.
  useEffect(() => {
    if (typeof window === "undefined") return;

    let pending: ReturnType<typeof setTimeout> | null = null;
    const save = () => {
      const key = getScrollKey();
      if (!key) return;
      try {
        window.sessionStorage.setItem(
          SCROLL_PREFIX + key,
          String(window.scrollY),
        );
      } catch {
        // sessionStorage may be full / disabled — swallow.
      }
    };
    const onScroll = () => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        save();
      }, 100);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (pending) clearTimeout(pending);
      save(); // final save on unmount (navigation away)
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Restore once content is ready, exactly once per mount.
  useEffect(() => {
    if (!ready || restoredRef.current) return;
    if (typeof window === "undefined") return;
    const key = getScrollKey();
    if (!key) return;
    const saved = window.sessionStorage.getItem(SCROLL_PREFIX + key);
    if (saved === null) return;
    const y = parseInt(saved, 10);
    if (!Number.isFinite(y)) return;
    restoredRef.current = true;
    requestAnimationFrame(() => {
      window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
    });
  }, [ready]);
}
