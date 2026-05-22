import type { CommentWithMetadata } from "@/types/ballots";

// ---------------------------------------------------------------------------
// Pure helpers shared by the argument- and comment-detail views.
// ---------------------------------------------------------------------------

/** Display name for a comment author (Bluesky handle for external, else canton displayName). */
export function authorName(
  comment: CommentWithMetadata,
  tc: (k: string) => string,
): string {
  if (comment.origin === "extern") {
    return comment.author.handle || comment.author.displayName || tc("bluesky");
  }
  return comment.author.displayName || tc("anonymous");
}

/**
 * Build a uri→comment map with `replies` populated from each comment's
 * `parentUri`. The returned comments are shallow clones (originals untouched).
 * Pass `extra` to seed comments that may be missing from `comments` (e.g. a
 * focal comment that wasn't part of the flat list).
 */
export function buildCommentMap(
  comments: CommentWithMetadata[],
  extra?: CommentWithMetadata | null,
): Map<string, CommentWithMetadata> {
  const source =
    extra && !comments.some((c) => c.uri === extra.uri)
      ? [...comments, extra]
      : comments;

  const map = new Map<string, CommentWithMetadata>();
  for (const c of source) map.set(c.uri, { ...c, replies: [] });
  for (const c of source) {
    if (c.parentUri && map.has(c.parentUri)) {
      map.get(c.parentUri)!.replies!.push(map.get(c.uri)!);
    }
  }
  return map;
}

/** Top-level comments (no parent), with their reply trees, in input order. */
export function rootComments(
  comments: CommentWithMetadata[],
  map: Map<string, CommentWithMetadata>,
): CommentWithMetadata[] {
  return comments.filter((c) => !c.parentUri).map((c) => map.get(c.uri)!);
}

/** Walk up from the focal comment to the root, returning ancestors top→down. */
export function buildAncestorChain(
  map: Map<string, CommentWithMetadata>,
  focalUri: string,
): CommentWithMetadata[] {
  const chain: CommentWithMetadata[] = [];
  let current = map.get(focalUri);
  while (current?.parentUri) {
    const parent = map.get(current.parentUri);
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}
