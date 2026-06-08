// Overlay-Stack entry — one per visible level. The stack is encoded in the URL
// via repeatable `?ov=<type>:<id>` params (insertion-order = stack-order).
//
// Add new types here as the system gains overlay-able content kinds (profile,
// peer-review …). Render-branches in the consumer's <OverlayHost> children
// switch on `type` to pick the right detail component.
export type OverlayEntry =
  | { type: "argument"; rkey: string }
  | { type: "comment"; uri: string }
  | { type: "profile"; did: string }
  | { type: "peerreview"; id: string }
  // Detail-Seite eines Taxonomy-Top-Topics: zeigt dessen Subtopics + Argumente.
  | { type: "taxonomy"; ballotRkey: string; topic: string };

export type OverlayEntryType = OverlayEntry["type"];

// Optional second argument to `navigate(entry, options?)`. Carries metadata
// about *why* the user is leaving the current view, used to scroll the user
// back to where they were when they return.
export type OverlayNavigateOptions = {
  // Identifier of the element the user clicked (e.g. a comment URI). Saved
  // against the current URL so that, when the user navigates back to this URL,
  // we can find the element via `[data-overlay-anchor="<value>"]` and scroll
  // it into view. Skip this option when no natural anchor exists — the view
  // will just scroll to the top on return.
  anchor?: string;
};
