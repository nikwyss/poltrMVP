import type { OverlayEntry } from "./types";

// URL-Schema: `?ov=<type>:<id>` — repeatable. Insertion-order = stack-order.
// Bottom of stack = first entry; visible top = last entry.
//
// IDs may contain `:` themselves (e.g. AT-URIs like `at://did:plc:abc/…`); we
// split on the FIRST colon only, so the rest is the raw id.

const PARAM = "ov";

export function parseOverlayStack(
  searchParams: URLSearchParams,
): OverlayEntry[] {
  const raw = searchParams.getAll(PARAM);
  const stack: OverlayEntry[] = [];
  for (const value of raw) {
    const colon = value.indexOf(":");
    if (colon < 0) continue; // malformed entry — skip silently
    const type = value.slice(0, colon);
    const id = value.slice(colon + 1);
    if (!id) continue;
    if (type === "argument") stack.push({ type: "argument", rkey: id });
    else if (type === "comment") stack.push({ type: "comment", uri: id });
    else if (type === "profile") stack.push({ type: "profile", did: id });
    else if (type === "peerreview") stack.push({ type: "peerreview", id });
    else if (type === "taxonomy") {
      // id = `<ballotRkey>:<topic>` — beide ohne `:`, also am ersten splitten.
      const sep = id.indexOf(":");
      if (sep > 0) {
        stack.push({
          type: "taxonomy",
          ballotRkey: id.slice(0, sep),
          topic: id.slice(sep + 1),
        });
      }
    }
    // unknown types are skipped — forward-compat with newer URLs from a newer
    // client. The visible top will simply be the last *known* entry.
  }
  return stack;
}

export function serializeOverlayStack(stack: OverlayEntry[]): string {
  const qp = new URLSearchParams();
  for (const entry of stack) {
    qp.append(PARAM, serializeEntry(entry));
  }
  return qp.toString();
}

function serializeEntry(entry: OverlayEntry): string {
  switch (entry.type) {
    case "argument":
      return `argument:${entry.rkey}`;
    case "comment":
      return `comment:${entry.uri}`;
    case "profile":
      return `profile:${entry.did}`;
    case "peerreview":
      return `peerreview:${entry.id}`;
    case "taxonomy":
      return `taxonomy:${entry.ballotRkey}:${entry.topic}`;
  }
}

// Stable key per entry — used for the (rare) cases where we need an in-memory
// map per entry (e.g. for debugging). The history.state-based scroll memory
// does *not* need this — it's keyed implicitly by the history entry itself.
export function entryKey(entry: OverlayEntry): string {
  return serializeEntry(entry);
}
