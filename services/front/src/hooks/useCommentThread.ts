"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createComment } from "@/lib/agent";
import { likeContent, unlikeContent } from "@/lib/ballots";
import { commentKeys, useCommentsQuery } from "@/lib/queries/comments";
import { isPdsError, type PdsError } from "@/lib/pdsError";
import type { CommentWithMetadata } from "@/types/ballots";

const asPdsError = (e: unknown): PdsError =>
  isPdsError(e) ? e : { code: "unknown", status: 0 };

/**
 * Shared thread state for the argument- and comment-detail views.
 *
 * The *flat* comment list for one argument lives in the TanStack Query cache
 * (keyed by `argumentUri`), so both detail overlays share one source: a like
 * or reply in one view is reflected in the other. Like toggles patch the cache
 * optimistically (with rollback); a new comment invalidates the list. The
 * inline composer state (text, target, in-flight) stays local — it's pure UI.
 *
 * Pass `argumentUri = undefined` while it's still being resolved (the detail
 * loads its argument first); the list query stays disabled until then.
 */
export function useCommentThread(
  argumentUri: string | undefined,
  options?: { onError?: (e: PdsError) => void },
) {
  const qc = useQueryClient();
  const onError = options?.onError;

  const query = useCommentsQuery(argumentUri);
  const comments = useMemo<CommentWithMetadata[]>(
    () => query.data ?? [],
    [query.data],
  );

  // Last comment-submit failure, for an inline alert in the composer
  // (the typed text is preserved). Cleared on a new attempt / success.
  const [commentError, setCommentError] = useState<PdsError | null>(null);

  // Composer: replyText, submit-in-flight, and the uri the composer targets.
  // `replyTarget` semantics are owned by the caller (a comment uri, or a
  // page-specific sentinel for the top-level composer).
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyTarget, setReplyTarget] = useState<string | null>(null);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);

  // Focus the textarea whenever the composer opens.
  useEffect(() => {
    if (replyTarget) replyInputRef.current?.focus();
  }, [replyTarget]);

  // Patch a single comment in the cached flat list.
  const patchComment = useCallback(
    (uri: string, patch: Partial<CommentWithMetadata>) => {
      if (!argumentUri) return;
      qc.setQueryData<CommentWithMetadata[]>(
        commentKeys.list(argumentUri),
        (prev) => prev?.map((c) => (c.uri === uri ? { ...c, ...patch } : c)),
      );
    },
    [qc, argumentUri],
  );

  /** Optimistically toggle a like with rollback on failure. */
  const toggleLike = useCallback(
    async (c: CommentWithMetadata) => {
      const liked = !!c.viewer?.like;

      patchComment(c.uri, {
        likeCount: (c.likeCount ?? 0) + (liked ? -1 : 1),
        viewer: liked ? undefined : { like: "__pending__" },
      });

      try {
        if (liked) {
          await unlikeContent(c.viewer!.like!);
          patchComment(c.uri, { viewer: undefined });
        } else {
          const likeUri = await likeContent(c.uri, c.cid);
          patchComment(c.uri, { viewer: { like: likeUri } });
        }
      } catch (err) {
        patchComment(c.uri, {
          likeCount: c.likeCount ?? 0,
          viewer: c.viewer,
        });
        onError?.(asPdsError(err));
      }
    },
    [patchComment, onError],
  );

  /**
   * Submit the composer text as a comment on `argumentUri`, optionally as a
   * reply to `parentUri`. Invalidates the list (→ refetch) and closes the
   * composer on success.
   */
  const submitComment = useCallback(
    async (argUri: string, parentUri?: string) => {
      if (!replyText.trim() || submitting) return;
      setSubmitting(true);
      setCommentError(null);
      try {
        await createComment(argUri, "", replyText.trim(), parentUri);
        setReplyText("");
        await qc.invalidateQueries({ queryKey: commentKeys.list(argUri) });
        setReplyTarget(null);
      } catch (err) {
        // Keep the typed text; surface an inline error in the composer.
        setCommentError(asPdsError(err));
      } finally {
        setSubmitting(false);
      }
    },
    [replyText, submitting, qc],
  );

  return {
    comments,
    // true while the list is loading for a known argument (idle when disabled).
    commentsLoading: !!argumentUri && query.isPending,
    toggleLike,
    submitComment,
    // composer
    replyText,
    setReplyText,
    submitting,
    replyTarget,
    setReplyTarget,
    replyInputRef,
    commentError,
    setCommentError,
  };
}
