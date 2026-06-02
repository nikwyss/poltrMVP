"use client";

import { useTranslations } from "next-intl";
import {
  OverlayHost,
  useOverlayCallbacks,
  type OverlayEntry,
  type OverlayRenderCtx,
} from "@/lib/overlay";
import { ArgumentDetail } from "@/components/argument-detail";
import { CommentDetail } from "@/components/comment-detail";

// Single, content-aware overlay surface for the entire app. Mount once at the
// (app) layout level; pages just call `useOverlay().navigate(entry)` to open.
//
// All i18n labels are read here, the entry-type switch lives here, and any
// page-specific callbacks (registered via `useOverlayCallback`) are forwarded
// into the detail components.
//
// New entry types are added in two places:
//   1) lib/overlay/types.ts — extend `OverlayEntry`
//   2) the switch below — render the matching detail component
export function OverlayContentHost() {
  const tc = useTranslations("common");
  const getCallbacks = useOverlayCallbacks();

  return (
    <OverlayHost
      closeLabel={tc("close")}
      backLabels={{
        argument: tc("backToArgument"),
        comment: tc("backToPost"),
        profile: tc("backToProfile"),
        peerreview: tc("backToPeerReview"),
      }}
      titles={{
        argument: tc("overlayTitleArgument"),
        comment: tc("overlayTitleComment"),
        profile: tc("overlayTitleProfile"),
        peerreview: tc("overlayTitlePeerReview"),
      }}
    >
      {(entry, ctx) => renderEntry(entry, ctx, getCallbacks)}
    </OverlayHost>
  );
}

function renderEntry(
  entry: OverlayEntry,
  ctx: OverlayRenderCtx,
  getCallbacks: () => import("@/lib/overlay").OverlayCallbacks,
) {
  switch (entry.type) {
    case "argument":
      return (
        <ArgumentDetail
          onClose={ctx.back}
          argRkey={entry.rkey}
          // The clicked element's identifier doubles as the anchor: on return
          // we look for `[data-overlay-anchor="<uri>"]` and scroll it into
          // view. Detail components annotate their clickable items.
          onNavigateToComment={(uri: string) =>
            ctx.navigate({ type: "comment", uri }, { anchor: uri })
          }
          onRated={(uri: string, pref: number | null) =>
            getCallbacks().onArgumentRated?.(uri, pref)
          }
          backLabel={ctx.backLabel}
          registerScrollContainer={ctx.registerScrollContainer}
        />
      );
    case "comment":
      return (
        <CommentDetail
          onClose={ctx.back}
          commentUri={entry.uri}
          onNavigateToComment={(uri: string) =>
            ctx.navigate({ type: "comment", uri }, { anchor: uri })
          }
          onNavigateToArgument={(rkey: string) =>
            ctx.navigate({ type: "argument", rkey }, { anchor: rkey })
          }
          backLabel={ctx.backLabel}
          registerScrollContainer={ctx.registerScrollContainer}
        />
      );
    case "profile":
      // Placeholder — profile component not yet implemented.
      return null;
    case "peerreview":
      // Placeholder — peer-review overlay arrives later. Stack/back/scroll
      // already work; only the visible body is missing.
      return null;
  }
}
