"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/AuthContext";
import { getComment, listComments } from "@/lib/agent";
import { useScrollRestore, smartBack } from "@/lib/scrollRestore";
import { cn } from "@/lib/utils";
import { buildCommentMap, buildAncestorChain } from "@/lib/commentThread";
import { useCommentThread } from "@/hooks/useCommentThread";
import type { CommentWithMetadata } from "@/types/ballots";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/spinner";
import { ArgumentSummary } from "@/components/argument-summary";
import { CommentAvatar, CommentContent } from "@/components/comment-content";
import { ReplyInput } from "@/components/reply-input";

// ---------------------------------------------------------------------------
// PostRow — one comment in the thread (used for ancestors, focal and replies).
// The avatar column carries the vertical thread line that visually connects
// the ancestor chain to the focal comment (X / Bluesky style).
// ---------------------------------------------------------------------------

const AVATAR = 32;

function PostRow({
  comment,
  focal = false,
  clickable = false,
  clamp = false,
  showLineTop = false,
  showLineBottom = false,
  onNavigate,
  onLikeToggle,
  onReply,
  activeComposerUri,
  renderComposer,
}: {
  comment: CommentWithMetadata;
  focal?: boolean;
  clickable?: boolean;
  clamp?: boolean;
  showLineTop?: boolean;
  showLineBottom?: boolean;
  onNavigate?: (uri: string) => void;
  onLikeToggle?: (c: CommentWithMetadata) => void;
  onReply?: (uri: string) => void;
  activeComposerUri?: string | null;
  renderComposer?: () => React.ReactNode;
}) {
  return (
    <div>
      <div className="flex gap-3">
        {/* avatar + thread line rail */}
        <div className="flex flex-col items-center" style={{ width: AVATAR }}>
          <div
            className={cn(
              "w-0.5 shrink-0",
              showLineTop ? "bg-border" : "bg-transparent",
            )}
            style={{ height: 8 }}
          />
          <CommentAvatar comment={comment} size={AVATAR} />
          {showLineBottom && <div className="w-0.5 flex-1 mt-1 bg-border" />}
        </div>

        {/* content */}
        <div
          className={cn("flex-1 min-w-0 pb-4", clickable && "cursor-pointer")}
          onClick={clickable ? () => onNavigate?.(comment.uri) : undefined}
        >
          <div
            className={cn(focal && "rounded-r-md px-3 py-2")}
            style={
              focal
                ? {
                    backgroundColor: "var(--brand-dim)",
                    borderLeft: "2px solid var(--brand)",
                  }
                : undefined
            }
          >
            <CommentContent
              comment={comment}
              focal={focal}
              clamp={clamp}
              onLikeToggle={onLikeToggle}
              onReply={onReply}
            />
          </div>
        </div>
      </div>
      {comment.uri === activeComposerUri && renderComposer && (
        <div className="pl-11 pb-3">{renderComposer()}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReplyTree — direct replies below the focal comment, nested via indentation.
// ---------------------------------------------------------------------------

function ReplyTree({
  comment,
  depth,
  onNavigate,
  onLikeToggle,
  onReply,
  activeComposerUri,
  renderComposer,
}: {
  comment: CommentWithMetadata;
  depth: number;
  onNavigate: (uri: string) => void;
  onLikeToggle: (c: CommentWithMetadata) => void;
  onReply: (uri: string) => void;
  activeComposerUri?: string | null;
  renderComposer?: () => React.ReactNode;
}) {
  const showChildren =
    !!comment.replies && comment.replies.length > 0 && depth < 2;

  return (
    <div>
      <PostRow
        comment={comment}
        clickable
        onNavigate={onNavigate}
        onLikeToggle={onLikeToggle}
        onReply={onReply}
        activeComposerUri={activeComposerUri}
        renderComposer={renderComposer}
      />
      {showChildren && (
        <div className="pl-6">
          {comment.replies!.map((r) => (
            <ReplyTree
              key={r.uri}
              comment={r}
              depth={depth + 1}
              onNavigate={onNavigate}
              onLikeToggle={onLikeToggle}
              onReply={onReply}
              activeComposerUri={activeComposerUri}
              renderComposer={renderComposer}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Argument info type
// ---------------------------------------------------------------------------

type ArgumentInfo = {
  uri: string;
  rkey: string;
  title: string;
  body?: string;
  type?: "PRO" | "CONTRA";
  likeCount?: number;
  commentCount?: number;
  reviewStatus?: string;
  ballotRkey: string;
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CommentDetailPage({
  isOverlay = false,
  onClose,
  commentUriOverride,
  onNavigateToComment,
  onNavigateToArgument,
  backLabel,
}: {
  isOverlay?: boolean;
  onClose?: () => void;
  commentUriOverride?: string;
  onNavigateToComment?: (uri: string) => void;
  onNavigateToArgument?: (rkey: string) => void;
  backLabel?: string;
} = {}) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const commentUri = commentUriOverride ?? searchParams.get("uri") ?? "";
  const t = useTranslations("commentDetail");
  const tc = useTranslations("common");

  const [argument, setArgument] = useState<ArgumentInfo | null>(null);
  const [focalUri, setFocalUri] = useState("");
  // Insurance in case the focal comment is missing from listComments().
  const [focalFallback, setFocalFallback] =
    useState<CommentWithMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const {
    comments,
    setComments,
    toggleLike,
    submitComment,
    replyText,
    setReplyText,
    submitting,
    replyTarget,
    setReplyTarget,
    replyInputRef,
  } = useCommentThread();

  // Derive the thread spine (ancestors → focal → direct replies) from the
  // flat comment list. Likes/replies update the list, so this stays in sync.
  const { focalComment, ancestors, directReplies } = useMemo(() => {
    if (!focalUri) {
      return {
        focalComment: null as CommentWithMetadata | null,
        ancestors: [] as CommentWithMetadata[],
        directReplies: [] as CommentWithMetadata[],
      };
    }
    const map = buildCommentMap(comments, focalFallback);
    const focal = map.get(focalUri) ?? null;
    return {
      focalComment: focal,
      ancestors: buildAncestorChain(map, focalUri),
      directReplies: focal?.replies ?? [],
    };
  }, [comments, focalUri, focalFallback]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) router.push("/");
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (!isAuthenticated || authLoading || !commentUri) return;

    (async () => {
      setLoading(true);
      setError("");
      try {
        const { comment, argument: arg } = await getComment(commentUri);
        const allCmts = await listComments(arg.uri);

        setArgument(arg);
        setFocalUri(comment.uri);
        setFocalFallback(comment);
        setComments(allCmts);

        // Empty thread → open the composer under the focal comment right away.
        const hasReplies = allCmts.some((c) => c.parentUri === comment.uri);
        setReplyTarget(hasReplies ? null : comment.uri);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load comment");
      } finally {
        setLoading(false);
      }
    })();
  }, [
    isAuthenticated,
    authLoading,
    commentUri,
    setComments,
    setReplyTarget,
  ]);

  const handleNavigateToComment = (uri: string) => {
    if (onNavigateToComment) {
      onNavigateToComment(uri);
      return;
    }
    router.push(
      `/ballot/${id}/arguments/feed/comment?uri=${encodeURIComponent(uri)}`,
    );
  };

  const handleNavigateToArgument = () => {
    if (!argument) return;
    if (onNavigateToArgument) {
      onNavigateToArgument(argument.rkey);
      return;
    }
    router.push(`/ballot/${id}/arguments/${argument.rkey}`);
  };

  const handleSubmitReply = () => {
    if (!argument || !focalUri) return;
    submitComment(argument.uri, replyTarget ?? focalUri);
  };

  useScrollRestore(!isOverlay && !loading && !!focalComment);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] gap-3">
        <Spinner />
        <span className="text-muted-foreground">{tc("restoringSession")}</span>
      </div>
    );
  }
  if (!isAuthenticated) return null;

  const loaded = !loading && !!focalComment && !!argument;

  // ── Shared content blocks (used by both overlay and full-page layouts) ──────
  const contextBox = !loading && focalComment && argument && (
    <ArgumentSummary
      title={argument.title}
      body={argument.body}
      type={argument.type}
      likeCount={argument.likeCount}
      commentCount={argument.commentCount}
      reviewStatus={argument.reviewStatus}
      clampBody
      onClick={handleNavigateToArgument}
    />
  );

  const renderComposer = () => (
    <ReplyInput
      ref={replyInputRef}
      value={replyText}
      onChange={setReplyText}
      onSubmit={handleSubmitReply}
      submitting={submitting}
      placeholder={t("replyPlaceholder")}
      onCancel={() => {
        setReplyText("");
        setReplyTarget(null);
      }}
    />
  );

  const threadBlock = !loading && focalComment && argument && (
    <div>
      {/* Spine: ancestor chain → focal, connected by a vertical thread line */}
      {ancestors.map((ancestor, idx) => (
        <PostRow
          key={ancestor.uri}
          comment={ancestor}
          clickable
          clamp
          showLineTop={idx > 0}
          showLineBottom
          onNavigate={handleNavigateToComment}
          onLikeToggle={toggleLike}
          onReply={setReplyTarget}
          activeComposerUri={replyTarget}
          renderComposer={renderComposer}
        />
      ))}

      <PostRow
        comment={focalComment}
        focal
        showLineTop={ancestors.length > 0}
        onLikeToggle={toggleLike}
        onReply={setReplyTarget}
        activeComposerUri={replyTarget}
        renderComposer={renderComposer}
      />

      {/* Replies */}
      {directReplies.length > 0 && (
        <div className="mt-5">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
            {t("replies")} ({directReplies.length})
          </div>
          {directReplies.map((reply) => (
            <ReplyTree
              key={reply.uri}
              comment={reply}
              depth={0}
              onNavigate={handleNavigateToComment}
              onLikeToggle={toggleLike}
              onReply={setReplyTarget}
              activeComposerUri={replyTarget}
              renderComposer={renderComposer}
            />
          ))}
        </div>
      )}
    </div>
  );

  // ── Overlay layout (rendered inside Dialog) ─────────────────────────────────
  if (isOverlay) {
    return (
      <div className="flex flex-col">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b flex items-center px-5 py-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="text-base leading-none">←</span>
            {backLabel ?? t("backToArgument")}
          </button>
        </div>

        {/* Scrolling content */}
        <div className="px-5 py-5 space-y-5">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                <strong>{tc("error")}:</strong> {error}
              </AlertDescription>
            </Alert>
          )}

          {loading && (
            <div className="flex items-center justify-center py-16 gap-3">
              <Spinner />
              <span className="text-muted-foreground">
                {t("loadingComment")}
              </span>
            </div>
          )}

          {loaded && (
            <>
              {contextBox}
              {threadBlock}
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Full-page layout ────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Button
        variant="outline"
        size="sm"
        onClick={() => smartBack(router, `/ballot/${id}/arguments/feed`)}
      >
        &larr; {t("backToFeed")}
      </Button>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            <strong>{tc("error")}:</strong> {error}
          </AlertDescription>
        </Alert>
      )}

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-10 gap-3">
            <Spinner />
            <span className="text-muted-foreground">{t("loadingComment")}</span>
          </CardContent>
        </Card>
      )}

      {loaded && (
        <>
          {contextBox}

          <Card>
            <CardContent className="pt-5">{threadBlock}</CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
