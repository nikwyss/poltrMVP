# Overlay Routing

Stacked, deep-linkable overlay system for argument-, comment-, profile- and peer-review-detail views on top of the ballot pages (booklet / feed). The user navigates through these as if they were a "browser inside the browser" — open, drill into a comment, click an author profile, go back step by step — without ever leaving the underlying list.

## Why an overlay

The booklet and feed pages list arguments. Opening an argument as a full-page navigation would lose the user's scroll position, force a re-render of the list, and break the "browse then dive in" mental model. The overlay keeps the list mounted underneath; opening details is non-destructive.

The current implementation lives in two modules:

```
services/frontend/src/lib/overlay/           ← generic stack / nav / scroll
services/frontend/src/lib/overlay-content/   ← app-specific type → component
```

## Core model

### URL is the stack

The visible overlay stack is encoded in the URL as a repeatable `?ov=<type>:<id>` search-param:

```
/ballot/663.1/arguments/booklet?ov=argument:7965
/ballot/663.1/arguments/booklet?ov=argument:7965&ov=comment:at://did:plc:…/9254
/ballot/663.1/arguments/booklet?ov=argument:7965&ov=comment:at://…/9254&ov=profile:did:plc:xyz
```

- `URLSearchParams.getAll("ov")` returns entries in insertion-order → that **is** the stack.
- Last entry = visible top.
- Second-to-last entry's type = the back-button label ("Zurück zum Argument", "Back to post", etc.).
- Deep-links work because the URL fully describes what's visible — refresh, share or bookmark.

### sessionStorage carries scroll-anchors; in-memory ref tracks push-count

We **don't** use `window.history.state` for our metadata. Next.js' App Router writes to that object on every navigation and popstate, and its internal `replaceState` calls do not spread the previous state — any custom keys we add get clobbered.

Instead:

- **Scroll-anchors** live in `sessionStorage` under the key `poltr.overlayAnchor.v1`, as a `Record<urlSearchString, string>`. The value is the identifier of the element the user clicked when leaving (e.g. a comment URI). On return we find the element via `[data-overlay-anchor="<value>"]` and `scrollIntoView({block: "center"})`.
- **`pushCount`** lives in a `useRef` inside the Provider. Tracks how many of our `navigate()` pushes have happened since the Provider mounted. Used by `back()` to distinguish a deep-link root (where `router.back()` would leave the page) from a normal in-session push (safe to `router.back()`). On `popstate` we decrement; on reload it resets to 0 (which makes deep-link semantics kick in — correct).

We use *anchors*, not pixel scroll-positions, because:
- Anchors survive content reflow (comments deleted, added, edited above the target).
- Anchors don't require waiting for the container to be tall enough — `scrollIntoView` works as soon as the target element is in the DOM. We retry every animation frame for up to ~500ms while the detail page's data fetch completes.
- The natural anchor for "user clicked X" is X's own identifier; no extra UI state to track.

### Scoping: only inside `/ballot/[id]/…`

The `<OverlayProvider>` and `<OverlayContentHost>` are mounted in [src/app/(app)/ballot/[id]/layout.tsx](../services/frontend/src/app/(app)/ballot/[id]/layout.tsx) — not at the top-level `(app)/layout.tsx`. Consequences:

- `useOverlay()` is only usable within a ballot route. Calling it from `/home`, `/profile`, etc. throws a clear error.
- Overlay state is scoped to the ballot context, so `useParams().id` (used inside `ArgumentDetail` to resolve `ballotRkey`) always works.

If overlays are ever needed from outside a ballot context (e.g. global notifications opening an argument), the provider must be hoisted **and** `ballotRkey` must travel through the OverlayEntry rather than be read from `useParams()`.

## Module layout

```
services/frontend/src/lib/overlay/
├── types.ts            # OverlayEntry union, OverlayCallbacks, OverlayHistoryState
├── url.ts              # parseOverlayStack ↔ serializeOverlayStack
├── context.tsx         # OverlayProvider: pushCount, scrollEl, callbacks-ref
├── use-overlay.ts      # useOverlay, useOverlayCallback, useOverlayCallbacks
├── overlay-host.tsx    # OverlayHost — generic Radix-Dialog shell
└── index.ts

services/frontend/src/lib/overlay-content/
├── overlay-content-host.tsx   # type-switch → ArgumentDetail / CommentDetail / …
└── index.ts

services/frontend/src/components/
├── argument-detail.tsx   # rendered for { type: "argument" }
└── comment-detail.tsx    # rendered for { type: "comment" }
```

`overlay/` is content-agnostic. `overlay-content/` is the bridge from the abstract stack to the concrete detail components.

## Public API

### `useOverlay()`

Read stack state and trigger navigation. Available to any component rendered under a ballot route.

```ts
const {
  stack,           // OverlayEntry[]
  top,             // OverlayEntry | null
  previousType,    // type of stack[length - 2] — drives the back-label
  willClose,       // true if back() closes the overlay entirely
  navigate,        // (entry, options?) => void  — push a new entry on top
  back,            // () => void                 — one step back (deep-link-safe)
  closeAll,        // () => void                 — clear the whole stack
  registerScrollContainer, // wired by detail components, not by pages
} = useOverlay();

// Plain navigation — on return, the previous view scrolls to top.
navigate({ type: "argument", rkey: "7965" });
navigate({ type: "comment", uri: "at://did:plc:…/comment/9254" });
navigate({ type: "profile", did: "did:plc:…" });
navigate({ type: "peerreview", id: "…" });

// With anchor — on return, scroll the matching element into view.
// The detail component must render `data-overlay-anchor="<id>"` on it.
navigate({ type: "comment", uri: X }, { anchor: X });
```

In practice you don't call `navigate` directly from page-level code — the OverlayContentHost wires the `onNavigateToComment` / `onNavigateToArgument` callbacks for the detail components and forwards the clicked identifier as the anchor.

### `useOverlayCallback(name, fn)`

Register a page-level callback that fires from inside a detail component. The classic use-case: live-update a card's rating in the booklet list while the user rates an argument inside the overlay.

```tsx
// In booklet/page.tsx
const handleArgRated = useCallback(
  (uri, preference) => { /* update local state + cache */ },
  [id],
);
useOverlayCallback("onArgumentRated", handleArgRated);
```

The OverlayContentHost forwards the latest registered callback to the relevant detail component on every render — pages that don't care omit the registration; the callback no-ops.

Callback names live in `OverlayCallbacks` in [types.ts](../services/frontend/src/lib/overlay/types.ts).

### `<OverlayHost>` (low-level)

Generic Dialog wrapper. Takes a render-prop child that returns the visible content for the current top entry, plus translated labels:

```tsx
<OverlayHost
  closeLabel="Schliessen"
  backLabels={{ argument: "Zurück zum Argument", … }}
  titles={{ argument: "Argument", … }}    // visually hidden, for screen readers
>
  {(entry, ctx) => /* return ReactNode */}
</OverlayHost>
```

In practice you'll almost never render `<OverlayHost>` directly — `<OverlayContentHost>` already does it with the right wiring. Only build a custom host if you want a non-Radix overlay shell.

### `<OverlayContentHost>` (high-level)

The single, app-specific overlay surface. Mounted once in the ballot layout. Knows which detail component to render for each entry type. Reads the i18n labels. Wires registered callbacks into the detail components.

```tsx
// In src/app/(app)/ballot/[id]/layout.tsx
<OverlayProvider>
  {children}
  <OverlayContentHost />
</OverlayProvider>
```

## Adding a new entry type

Example: a `peerreview` overlay backed by a new `PeerReviewDetail` component.

1. **Already done for peer-review:** extend the `OverlayEntry` union in [types.ts](../services/frontend/src/lib/overlay/types.ts). For something new:

   ```ts
   export type OverlayEntry =
     | { type: "argument"; rkey: string }
     | { type: "comment"; uri: string }
     | { type: "profile"; did: string }
     | { type: "peerreview"; id: string }
     | { type: "milestone"; id: string };   // ← NEW
   ```

2. **Extend `url.ts`** — both `parseOverlayStack` and `serializeEntry`. TypeScript's exhaustiveness check will fail compile until both are updated.

3. **i18n** — add `backToMilestone` and `overlayTitleMilestone` to every locale file (`messages/{de,en,fr,it,rm}.json`, under `common`).

4. **Render branch in [overlay-content-host.tsx](../services/frontend/src/lib/overlay-content/overlay-content-host.tsx):**

   ```tsx
   case "milestone":
     return (
       <MilestoneDetail
         id={entry.id}
         onClose={ctx.back}
         backLabel={ctx.backLabel}
         registerScrollContainer={ctx.registerScrollContainer}
         // forward callbacks via getCallbacks() if needed
       />
     );
   ```

5. **Detail component contract.** A detail component must:
   - Accept `onClose: () => void` for the back button
   - Accept `backLabel: string` for the back-button text
   - Accept `registerScrollContainer: (el: HTMLElement | null) => void` and attach it to the actual scrolling element (the wrapper with `overflow-y-auto`). Without this, anchor restoration breaks for that type.
   - Accept type-specific identifier props (e.g. `id`, `did`, `uri`, `rkey`)
   - Accept type-specific navigation callbacks (`onNavigateToComment`, etc.) — these wrap `ctx.navigate(...)` for in-overlay links
   - Render `data-overlay-anchor="<id>"` on each clickable item that can navigate further (the comment row, the parent-argument summary, …). The `<id>` is the same identifier passed as `{anchor: id}` in the corresponding `ctx.navigate` call.

Look at [`<ArgumentDetail>`](../services/frontend/src/components/argument-detail.tsx) or [`<CommentDetail>`](../services/frontend/src/components/comment-detail.tsx) for a working template.

## Adding a new page-level callback

Example: notifying the booklet when an argument is deleted.

1. Add the field to `OverlayCallbacks` in [types.ts](../services/frontend/src/lib/overlay/types.ts):

   ```ts
   export type OverlayCallbacks = {
     onArgumentRated?: (argUri: string, preference: number | null) => void;
     onArgumentDeleted?: (argUri: string) => void;   // ← NEW
   };
   ```

2. Wire it into the detail component in [overlay-content-host.tsx](../services/frontend/src/lib/overlay-content/overlay-content-host.tsx):

   ```tsx
   <ArgumentDetail
     …
     onDeleted={(uri) => getCallbacks().onArgumentDeleted?.(uri)}
   />
   ```

3. Have the page register it:

   ```ts
   useOverlayCallback("onArgumentDeleted", handleArgDeleted);
   ```

## Scroll-position handling

The overlay restores the user's view position across stack navigations using **anchor IDs**, not pixel scroll-Y values:

```
booklet → open argument A → scroll down → click comment X near the bottom
        → save anchor X for argument-A's URL
        → push comment-detail
        → click back
        → argument-A re-mounts → scroll the element with
          [data-overlay-anchor="X"] into view (block: center)
```

Mechanism:

- Each detail component renders `data-overlay-anchor="<id>"` on its clickable items (e.g. each comment row in argument-detail; each PostRow + the ArgumentSummary in comment-detail).
- When the user clicks an item to navigate, the OverlayContentHost calls `ctx.navigate(newEntry, { anchor: clickedId })`. The Provider writes the anchor into `sessionStorage["poltr.overlayAnchor.v1"][window.location.search]` *before* pushing the new URL.
- When the URL changes (via either our in-overlay back-button calling `router.back()`, the browser Back button, or any other navigation), the Provider's `useEffect` watching `searchParams` arms `pendingAnchor` with the saved anchor for the now-current URL and waits.
- When the detail page mounts and calls `registerScrollContainer(el)`, the Provider runs `scrollAnchorIntoView(el, anchor)` — a polling loop (~30 RAF cycles, ~500ms) that retries `querySelector('[data-overlay-anchor="<id>"]')` until the element exists (i.e. until the detail's data fetch is done and the comments are rendered).

If the target element never shows up (network failure, content deleted), the polling gives up silently and the user stays at the top.

If a future detail component forgets to wire `registerScrollContainer`, anchor restoration breaks for that type but the rest still works. If it forgets to render `data-overlay-anchor` on its clickable items, the user lands at the top of the view on return — degrades gracefully.

## Back-button & close semantics

| Action | Effect |
|---|---|
| Header back button (`←`) | `ctx.back()` — one step. Label reflects the type underneath. |
| Browser back / Alt+← / mobile swipe-back | Same as header back. Reads same history. |
| Backdrop click | `closeAll()` — clears entire stack. |
| `Escape` key | `closeAll()` — Radix default. |

`back()` is deep-link-safe: if the user arrived directly on a deep-link with overlays, `router.back()` would leave the page entirely. The Provider detects this via an in-memory `pushCount` ref (incremented per `navigate`, decremented when the URL stack shrinks). If `pushCount === 0` (deep-link root) it uses `router.replace` with one fewer `ov=` instead. So peeling overlays from a deep-link still works as expected.

A small surprise here: Next.js App Router's `router.back()` does *not* fire a `popstate` event — it updates the URL via its internal subscription system. The Provider therefore restores anchors by watching `useSearchParams` rather than listening to `popstate`. Browser-driven Back/Forward also surfaces through `useSearchParams`, so a single mechanism covers both.

## Accessibility

Radix's `<Dialog>` requires:

1. A `<DialogTitle>` — supplied by `<OverlayHost>` as a `sr-only` element. The title text comes from the per-type `titles` prop.
2. Either a `<DialogDescription>` or an explicit `aria-describedby={undefined}` opt-out. We opt out — the title plus the rendered detail content carry the semantics.

## Limitations & future work

- **Ballot scope.** Overlays only work under `/ballot/[id]/...`. To open overlays from anywhere (e.g. a notifications list), the Provider would need to be hoisted to `(app)/layout.tsx` and `ballotRkey` threaded through `OverlayEntry` (currently read via `useParams().id` inside `ArgumentDetail`).
- **No forward-navigation sync.** Browser-Forward after a Back is *not* expected to round-trip the stack reliably — the pushCount mechanism only tracks pushes, not direction. Forward edge-cases are out of scope.
- **sessionStorage-bound anchor cache, wiped on close.** Anchors live in sessionStorage under `poltr.overlayAnchor.v1`. The full map is cleared whenever the overlay stack goes back to zero (user closed the overlay, or initial mount lands on a no-overlay URL). Without this, anchors would pile up across sessions in the same tab.
- **No standalone routes.** The previous `/ballot/X/arguments/Y` and `/ballot/X/arguments/feed/comment?uri=…` routes were removed. Sharing an argument now produces a `?ov=…` URL on top of `/feed` or `/booklet`.

## Files at a glance

| File | Role |
|---|---|
| [services/frontend/src/lib/overlay/types.ts](../services/frontend/src/lib/overlay/types.ts) | `OverlayEntry` union, `OverlayCallbacks` registry, history-state shape |
| [services/frontend/src/lib/overlay/url.ts](../services/frontend/src/lib/overlay/url.ts) | Parse / serialize `?ov=…` |
| [services/frontend/src/lib/overlay/context.tsx](../services/frontend/src/lib/overlay/context.tsx) | `OverlayProvider` — pushCount, scrollEl, callback-registry, popstate |
| [services/frontend/src/lib/overlay/use-overlay.ts](../services/frontend/src/lib/overlay/use-overlay.ts) | `useOverlay`, `useOverlayCallback`, `useOverlayCallbacks` |
| [services/frontend/src/lib/overlay/overlay-host.tsx](../services/frontend/src/lib/overlay/overlay-host.tsx) | Generic Radix Dialog wrapper |
| [services/frontend/src/lib/overlay-content/overlay-content-host.tsx](../services/frontend/src/lib/overlay-content/overlay-content-host.tsx) | App-specific type-switch + label wiring |
| [services/frontend/src/components/argument-detail.tsx](../services/frontend/src/components/argument-detail.tsx) | Argument overlay body |
| [services/frontend/src/components/comment-detail.tsx](../services/frontend/src/components/comment-detail.tsx) | Comment overlay body |
| [services/frontend/src/app/(app)/ballot/[id]/layout.tsx](../services/frontend/src/app/(app)/ballot/[id]/layout.tsx) | Mounts `<OverlayProvider>` + `<OverlayContentHost>` |

## Related planning docs

- [doc/plans/overlay_routing_plan.md](plans/overlay_routing_plan.md) — initial broad plan (URL-stack + scroll memory + back-label)
- [doc/plans/overlay_minimal_plan.md](plans/overlay_minimal_plan.md) — the minimal-variant plan that was implemented
