import { useEffect } from "react";
import { useOverlayInternal } from "./context";
import type {
  OverlayCallbacks,
  OverlayEntry,
  OverlayNavigateOptions,
} from "./types";

// Public API for navigation. The callback registry has its own dedicated hook
// (`useOverlayCallback`) so consumers don't see the lower-level setter.
export type UseOverlayApi = {
  stack: OverlayEntry[];
  top: OverlayEntry | null;

  // Typ des Entries unter dem sichtbaren Top (null = top ist Bottom of stack).
  // Driver für das Back-Label.
  previousType: OverlayEntry["type"] | null;

  // true wenn `back()` das Overlay komplett schliesst (top war einziger Entry).
  willClose: boolean;

  // Push a new entry on top of the stack. Pass `{anchor: <id>}` to save the
  // clicked element's identifier so it can be scrolled back into view on
  // return. The detail component must render `data-overlay-anchor="<id>"`
  // on the matching element.
  navigate: (entry: OverlayEntry, options?: OverlayNavigateOptions) => void;
  back: () => void;
  closeAll: () => void;

  registerScrollContainer: (el: HTMLElement | null) => void;
};

export function useOverlay(): UseOverlayApi {
  const ctx = useOverlayInternal();
  return {
    stack: ctx.stack,
    top: ctx.top,
    previousType: ctx.previousType,
    willClose: ctx.willClose,
    navigate: ctx.navigate,
    back: ctx.back,
    closeAll: ctx.closeAll,
    registerScrollContainer: ctx.registerScrollContainer,
  };
}

// Register a page-level callback that fires from inside the overlay's detail
// components (e.g. live-updating a list when a rating changes). Auto-cleans
// up on unmount. Pass `undefined` (or just unmount) to unregister.
//
// Usage in a page component:
//   useOverlayCallback("onArgumentRated", handleArgRated);
export function useOverlayCallback<K extends keyof OverlayCallbacks>(
  name: K,
  fn: OverlayCallbacks[K] | undefined,
) {
  const { setCallback } = useOverlayInternal();
  useEffect(() => {
    setCallback(name, fn);
    return () => setCallback(name, undefined);
  }, [name, fn, setCallback]);
}

// Stable getter for currently-registered callbacks. Use this in the
// <OverlayContentHost> to forward optional callbacks into detail components
// without re-rendering on every registration change.
export function useOverlayCallbacks(): () => OverlayCallbacks {
  return useOverlayInternal().getCallbacks;
}
