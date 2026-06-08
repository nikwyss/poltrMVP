"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseOverlayStack, serializeOverlayStack } from "./url";
import type { OverlayEntry, OverlayNavigateOptions } from "./types";

// Internal context shape — published API lives in `use-overlay.ts`.
type OverlayCtx = {
  stack: OverlayEntry[];
  top: OverlayEntry | null;
  previousType: OverlayEntry["type"] | null;
  willClose: boolean;
  navigate: (entry: OverlayEntry, options?: OverlayNavigateOptions) => void;
  back: () => void;
  closeAll: () => void;
  registerScrollContainer: (el: HTMLElement | null) => void;
};

const Ctx = createContext<OverlayCtx | null>(null);

export function useOverlayInternal(): OverlayCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useOverlay must be used inside <OverlayProvider>");
  }
  return ctx;
}

// ─── Anchor cache ──────────────────────────────────────────────────────────
//
// When the user clicks "into" something (e.g. a comment in the argument view),
// we save the clicked element's identifier as an "anchor" for the *current*
// URL. On return, we look up the anchor for the URL we just landed on and
// scroll the element with `[data-overlay-anchor="<value>"]` into view.
//
// We use sessionStorage (not `window.history.state`): Next.js' App Router
// overwrites custom keys on its internal `replaceState` calls during
// navigation. sessionStorage is independent.
const ANCHOR_STORE_KEY = "poltr.overlayAnchor.v1";

function readAnchorMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.sessionStorage.getItem(ANCHOR_STORE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeAnchorMap(m: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ANCHOR_STORE_KEY, JSON.stringify(m));
  } catch {
    // private mode / quota — silently no-op
  }
}

function saveAnchorFor(searchKey: string, anchor: string) {
  const m = readAnchorMap();
  m[searchKey] = anchor;
  writeAnchorMap(m);
}

function clearAnchorFor(searchKey: string) {
  const m = readAnchorMap();
  if (searchKey in m) {
    delete m[searchKey];
    writeAnchorMap(m);
  }
}

function clearAllAnchors() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(ANCHOR_STORE_KEY);
  } catch {
    // ignore
  }
}

function readAnchorFor(searchKey: string): string | null {
  return readAnchorMap()[searchKey] ?? null;
}

// How long we wait for the anchor element to appear after the detail component
// mounts. Detail pages load data async; the target element only enters the DOM
// once the fetch resolves. We watch for mutations and give up after this.
const ANCHOR_LOOKUP_TIMEOUT_MS = 5000;

// Iterate descendants with data-overlay-anchor and compare values via
// getAttribute. `querySelector` with an attribute selector + CSS.escape works
// in theory but is fragile for URIs containing `:` and `/` — iteration
// sidesteps escape concerns entirely.
function findAnchor(root: HTMLElement, anchor: string): HTMLElement | null {
  const candidates = root.querySelectorAll<HTMLElement>(
    "[data-overlay-anchor]",
  );
  for (const el of Array.from(candidates)) {
    if (el.getAttribute("data-overlay-anchor") === anchor) {
      return el;
    }
  }
  return null;
}

function scrollAnchorIntoView(root: HTMLElement, anchor: string) {
  const initial = findAnchor(root, anchor);
  if (initial) {
    initial.scrollIntoView({ block: "center" });
    return;
  }

  // Otherwise observe descendant mutations and retry until the target shows up
  // or we hit the timeout. Detail pages typically populate ~100-500ms after
  // mount once their fetches resolve.
  const observer = new MutationObserver(() => {
    const target = findAnchor(root, anchor);
    if (target) {
      target.scrollIntoView({ block: "center" });
      observer.disconnect();
      window.clearTimeout(timeoutId);
    }
  });
  observer.observe(root, { childList: true, subtree: true });

  const timeoutId = window.setTimeout(() => {
    observer.disconnect();
    // Gave up — user stays at top of view.
  }, ANCHOR_LOOKUP_TIMEOUT_MS);
}

// ─── Provider ──────────────────────────────────────────────────────────────
//
// All callbacks are wrapped in `useCallback` so their references are stable
// across renders. Without that, every Provider re-render would change the
// `registerScrollContainer` reference, and React would fire it on every
// detail component instance with old(null)+new(el) — leading to spurious
// ref-toggles that consume `pendingAnchor` at the wrong moment.
//
// The Provider value is also memoised so context consumers don't re-render
// unnecessarily.
export function OverlayProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const stack = useMemo(
    () => parseOverlayStack(searchParams),
    [searchParams],
  );
  const top = stack[stack.length - 1] ?? null;
  const previousType =
    stack.length >= 2 ? stack[stack.length - 2].type : null;
  const willClose = stack.length <= 1;

  const pushCount = useRef(0);
  const scrollEl = useRef<HTMLElement | null>(null);
  const pendingAnchor = useRef<string | null>(null);
  // Keep the latest `stack` in a ref so the stable `navigate`/`back` callbacks
  // can read it without being recreated on every stack change.
  const stackRef = useRef(stack);
  stackRef.current = stack;

  const registerScrollContainer = useCallback((el: HTMLElement | null) => {
    scrollEl.current = el;
    if (el && pendingAnchor.current !== null) {
      const anchor = pendingAnchor.current;
      pendingAnchor.current = null;
      scrollAnchorIntoView(el, anchor);
    }
  }, []);

  const navigate = useCallback(
    (entry: OverlayEntry, options?: OverlayNavigateOptions) => {
      const leavingKey = window.location.search;
      if (options?.anchor) {
        saveAnchorFor(leavingKey, options.anchor);
      } else {
        // No anchor on this hop — clear any stale entry so we don't accidentally
        // restore an anchor from a previous visit.
        clearAnchorFor(leavingKey);
      }

      pushCount.current += 1;
      const next = serializeOverlayStack([...stackRef.current, entry]);
      router.push(`?${next}`, { scroll: false });
    },
    [router],
  );

  const back = useCallback(() => {
    if (pushCount.current > 0) {
      router.back();
    } else {
      // Deep-link root: no in-session history-entry to pop. Peel one stack
      // level via replace so the user lands on the entry beneath.
      const newStack = stackRef.current.slice(0, -1);
      router.replace(
        newStack.length ? `?${serializeOverlayStack(newStack)}` : "?",
        { scroll: false },
      );
    }
  }, [router]);

  const closeAll = useCallback(() => {
    router.push("?", { scroll: false });
  }, [router]);

  // Anchor-restore on URL change. We watch `searchParams` rather than the
  // `popstate` event because Next.js' App Router `router.back()` updates the
  // URL via its internal subscription without firing `popstate`; watching
  // searchParams catches both router.back() *and* Browser-Back.
  const prevSearchRef = useRef<string | null>(null);
  useEffect(() => {
    const newSearch =
      typeof window === "undefined" ? "" : window.location.search;
    const prev = prevSearchRef.current;
    prevSearchRef.current = newSearch;

    if (prev === null) return; // initial mount — no navigation yet
    if (prev === newSearch) return; // re-render without URL change

    const anchor = readAnchorFor(newSearch);
    if (anchor) {
      pendingAnchor.current = anchor;
    }
  }, [searchParams]);

  // Decrement pushCount when the stack shrinks (user navigated back via any
  // means). Wipe the anchor cache whenever the stack is empty — both on the
  // initial mount (defensive against anchors leftover in sessionStorage from a
  // previous overlay session in this tab) and when the user closes the overlay
  // (stack transitions back to 0). Otherwise anchors would accumulate forever.
  const prevStackLenRef = useRef(stack.length);
  useEffect(() => {
    if (stack.length < prevStackLenRef.current) {
      pushCount.current = Math.max(0, pushCount.current - 1);
    }
    if (stack.length === 0) {
      clearAllAnchors();
    }
    prevStackLenRef.current = stack.length;
  }, [stack.length]);

  const value = useMemo<OverlayCtx>(
    () => ({
      stack,
      top,
      previousType,
      willClose,
      navigate,
      back,
      closeAll,
      registerScrollContainer,
    }),
    [
      stack,
      top,
      previousType,
      willClose,
      navigate,
      back,
      closeAll,
      registerScrollContainer,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
