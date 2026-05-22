"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listComments, createComment } from "@/lib/agent";
import { likeContent, unlikeContent } from "@/lib/ballots";
import type { CommentWithMetadata } from "@/types/ballots";

/**
 * Shared thread state for the argument- and comment-detail views.
 *
 * Owns the *flat* list of comments for one argument (callers derive their own
 * tree/spine via the helpers in `lib/commentThread`), the like-toggle logic
 * (optimistic update + rollback) and the inline composer state. Because the
 * list is flat, like toggles apply to any comment — top-level or nested.
 */
export function useCommentThread() {
  const [comments, setComments] = useState<CommentWithMetadata[]>([]);

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

  /** Fetch the flat comment list for an argument and store it. */
  const reload = useCallback(async (argumentUri: string) => {
    const all = await listComments(argumentUri);
    setComments(all);
    return all;
  }, []);

  // Patch a single comment in the flat list.
  const patchComment = useCallback(
    (uri: string, patch: Partial<CommentWithMetadata>) => {
      setComments((prev) =>
        prev.map((c) => (c.uri === uri ? { ...c, ...patch } : c)),
      );
    },
    [],
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
        console.error("Failed to toggle like:", err);
        patchComment(c.uri, {
          likeCount: c.likeCount ?? 0,
          viewer: c.viewer,
        });
      }
    },
    [patchComment],
  );

  /**
   * Submit the composer text as a comment on `argumentUri`, optionally as a
   * reply to `parentUri`. Reloads the list and closes the composer on success.
   */
  const submitComment = useCallback(
    async (argumentUri: string, parentUri?: string) => {
      if (!replyText.trim() || submitting) return;
      setSubmitting(true);
      try {
        await createComment(argumentUri, "", replyText.trim(), parentUri);
        setReplyText("");
        await reload(argumentUri);
        setReplyTarget(null);
      } catch (err) {
        console.error("Failed to submit comment:", err);
      } finally {
        setSubmitting(false);
      }
    },
    [replyText, submitting, reload],
  );

  return {
    comments,
    setComments,
    reload,
    toggleLike,
    submitComment,
    // composer
    replyText,
    setReplyText,
    submitting,
    replyTarget,
    setReplyTarget,
    replyInputRef,
  };
}
