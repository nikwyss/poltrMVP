import { useOverlayInternal } from "./context";
import type { OverlayEntry, OverlayNavigateOptions } from "./types";

// Public API for navigation.
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
