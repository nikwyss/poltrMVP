"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useOverlay } from "./use-overlay";
import type { OverlayEntry, OverlayNavigateOptions } from "./types";

// Context passed into the render-prop child. The consumer wires these into the
// detail components it renders for each entry type.
export type OverlayRenderCtx = {
  back: () => void;
  backLabel: string;
  navigate: (entry: OverlayEntry, options?: OverlayNavigateOptions) => void;
  registerScrollContainer: (el: HTMLElement | null) => void;
};

// Radix-Dialog plays a ~200ms close animation. If we clear the rendered entry
// the instant `top` becomes null, the user sees the dialog fade out empty.
// Keep the last-rendered entry around for this long so content fades with the
// dialog chrome. Switching to a new entry is immediate (no linger).
const CLOSE_ANIMATION_MS = 350;

export function OverlayHost({
  children,
  closeLabel,
  backLabels,
  titles,
  className,
}: {
  children: (entry: OverlayEntry, ctx: OverlayRenderCtx) => ReactNode;
  closeLabel: string;
  backLabels: Partial<Record<OverlayEntry["type"], string>>;
  // Screen-reader title per entry-type. Radix-Dialog requires a `DialogTitle`
  // for a11y; we render it visually hidden so the overlay-chrome stays clean.
  titles: Partial<Record<OverlayEntry["type"], string>>;
  className?: string;
}) {
  const {
    top,
    previousType,
    willClose,
    back,
    closeAll,
    navigate,
    registerScrollContainer,
  } = useOverlay();

  // Back label is derived purely from the stack: the type *underneath* the
  // visible top tells the user where they'll land. No URL-shape heuristics.
  const backLabel = willClose
    ? closeLabel
    : (previousType && backLabels[previousType]) ?? closeLabel;

  // Linger-rendered entry: tracks `top` immediately on open/navigate, but
  // delays clearing for the duration of the dialog's close animation.
  const [rendered, setRendered] = useState<OverlayEntry | null>(top);
  useEffect(() => {
    if (top) {
      setRendered(top);
      return;
    }
    const id = setTimeout(() => setRendered(null), CLOSE_ANIMATION_MS);
    return () => clearTimeout(id);
  }, [top]);

  const ctx: OverlayRenderCtx = {
    back,
    backLabel,
    navigate,
    registerScrollContainer,
  };

  const srTitle = (rendered && titles[rendered.type]) ?? closeLabel;

  return (
    <Dialog
      open={!!top}
      onOpenChange={(open) => {
        if (!open) closeAll();
      }}
    >
      <DialogContent
        showCloseButton={false}
        // Opt out of aria-describedby: there is no meaningful single-sentence
        // description per overlay entry. The DialogTitle below + the rendered
        // detail content carry the semantics for screen readers.
        aria-describedby={undefined}
        className={
          className ??
          "sm:max-w-4xl w-full h-[92vh] p-0 bg-transparent border-0 shadow-none"
        }
      >
        <DialogTitle className="sr-only">{srTitle}</DialogTitle>
        {rendered && children(rendered, ctx)}
      </DialogContent>
    </Dialog>
  );
}
