"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/AuthContext";
import { getComment, listComments, createComment } from "@/lib/agent";
import { likeContent, unlikeContent } from "@/lib/ballots";
import { useScrollRestore, smartBack } from "@/lib/scrollRestore";
import { formatRelativeTime, cn } from "@/lib/utils";
import type { CommentWithMetadata } from "@/types/ballots";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/spinner";
import { ProContraBadge, ReviewStatusBadge } from "@/components/pro-contra-badge";
import { CantonAvatar, BskyAvatar } from "@/components/canton-avatar";
import { ReplyInput } from "@/components/reply-input";

// ---------------------------------------------------------------------------
// Thread helpers
// ---------------------------------------------------------------------------

function buildAncestorChain(
  commentMap: Map<string, CommentWithMetadata>,
  focalUri: string,
): CommentWithMetadata[] {
  const chain: CommentWithMetadata[] = [];
  let current = commentMap.get(focalUri);
  while (current?.parentUri) {
    const parent = commentMap.get(current.parentUri);
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}

function authorName(
  comment: CommentWithMetadata,
  tc: (k: string) => string,
): string {
  if (comment.origin === "extern") {
    return (
      comment.author.handle || comment.author.displayName || tc("bluesky")
    );
  }
  return comment.author.displayName || tc("anonymous");
}

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
  const tc = useTranslations("common");
  const isExtern = comment.origin === "extern";
  const liked = !!comment.viewer?.like;

  return (
    <div>
    <div className="flex gap-3">
      {/* avatar + thread line rail */}
      <div className="flex flex-col items-center" style={{ width: AVATAR }}>
        <div
          className={cn("w-0.5 shrink-0", showLineTop ? "bg-border" : "bg-transparent")}
          style={{ height: 8 }}
        />
        {isExtern ? (
          <BskyAvatar size={AVATAR} />
        ) : (
          <CantonAvatar
            canton={comment.author.canton}
            color={comment.author.color}
            size={AVATAR}
          />
        )}
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
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
            <span className="font-semibold text-foreground">
              {authorName(comment, tc)}
            </span>
            {isExtern && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {tc("bluesky")}
              </Badge>
            )}
            <span>
              {comment.record.createdAt
                ? formatRelativeTime(comment.record.createdAt)
                : ""}
            </span>
          </div>

          <div
            className={cn(
              "leading-normal mt-0.5",
              focal ? "text-base" : "text-sm",
              clamp && "line-clamp-4",
            )}
          >
            {comment.record.body}
          </div>

          <div className="flex gap-4 mt-1.5 text-xs text-muted-foreground">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onLikeToggle?.(comment);
              }}
              className="bg-transparent border-none p-0 cursor-pointer text-xs"
              style={{ color: liked ? "var(--brand)" : "#8e8e8e" }}
            >
              {liked ? "❤" : "♡"}{" "}
              {(comment.likeCount ?? 0) > 0 ? comment.likeCount : ""}
            </button>
            {!isExtern && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReply?.(comment.uri);
                }}
                className={cn(
                  "bg-transparent border-none p-0 cursor-pointer text-xs",
                  focal
                    ? "text-primary font-semibold"
                    : "text-muted-foreground",
                )}
              >
                {"💬"} {tc("reply")}
              </button>
            )}
          </div>
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
// Argument context box (clickable → opens the argument)
// ---------------------------------------------------------------------------

function ArgumentContextBox({
  title,
  body,
  type,
  likeCount,
  commentCount,
  reviewStatus,
  onClick,
}: {
  title: string;
  body?: string;
  type?: "PRO" | "CONTRA";
  likeCount?: number;
  commentCount?: number;
  reviewStatus?: string;
  onClick?: () => void;
}) {
  const accentColor =
    type === "PRO"
      ? "var(--green)"
      : type === "CONTRA"
        ? "var(--red)"
        : "var(--border)";

  return (
    <div
      onClick={onClick}
      className={cn(
        "pl-4 pr-2 py-2 rounded-r",
        onClick && "cursor-pointer hover:bg-muted/40 transition-colors",
      )}
      style={{ borderLeft: `4px solid ${accentColor}` }}
    >
      <div className="flex items-start gap-2 mb-1">
        <h3 className="text-base font-bold flex-1 leading-snug m-0">{title}</h3>
        {type && <ProContraBadge type={type.toLowerCase()} />}
        {onClick && (
          <span className="text-muted-foreground text-base leading-none mt-0.5">
            {"›"}
          </span>
        )}
      </div>
      {body && (
        <p className="text-sm text-muted-foreground leading-relaxed m-0 mb-2 line-clamp-2">
          {body}
        </p>
      )}
      <div className="flex gap-4 text-xs text-muted-foreground items-center flex-wrap">
        {(likeCount ?? 0) > 0 && (
          <span>
            {"♡"} {likeCount}
          </span>
        )}
        {(commentCount ?? 0) > 0 && (
          <span>
            {"💬"} {commentCount}
          </span>
        )}
        <ReviewStatusBadge status={reviewStatus} />
      </div>
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

  const [focalComment, setFocalComment] = useState<CommentWithMetadata | null>(
    null,
  );
  const [argument, setArgument] = useState<ArgumentInfo | null>(null);
  const [directReplies, setDirectReplies] = useState<CommentWithMetadata[]>([]);
  const [ancestors, setAncestors] = useState<CommentWithMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // null = no composer open; otherwise the uri of the comment being replied to.
  const [replyTarget, setReplyTarget] = useState<string | null>(null);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);

  // Focus the textarea whenever the composer opens.
  useEffect(() => {
    if (replyTarget) replyInputRef.current?.focus();
  }, [replyTarget]);

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

        const commentMap = new Map<string, CommentWithMetadata>();
        for (const c of allCmts) {
          commentMap.set(c.uri, { ...c, replies: [] });
        }
        if (!commentMap.has(comment.uri)) {
          commentMap.set(comment.uri, { ...comment, replies: [] });
        }

        for (const c of allCmts) {
          if (c.parentUri && commentMap.has(c.parentUri)) {
            commentMap.get(c.parentUri)!.replies!.push(commentMap.get(c.uri)!);
          }
        }

        const chain = buildAncestorChain(commentMap, comment.uri);
        const replies = allCmts
          .filter((c) => c.parentUri === comment.uri)
          .map((c) => commentMap.get(c.uri)!);

        setFocalComment(comment);
        setArgument(arg);
        setAncestors(chain);
        setDirectReplies(replies);
        // Empty thread → open the composer under the focal comment right away.
        setReplyTarget(replies.length === 0 ? comment.uri : null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load comment");
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated, authLoading, commentUri]);

  const handleLikeToggle = useCallback(
    async (c: CommentWithMetadata) => {
      const liked = !!c.viewer?.like;

      if (c.uri === focalComment?.uri) {
        setFocalComment((prev) =>
          prev
            ? {
                ...prev,
                likeCount: (prev.likeCount ?? 0) + (liked ? -1 : 1),
                viewer: liked ? undefined : { like: "__pending__" },
              }
            : prev,
        );
      } else {
        setDirectReplies((prev) =>
          prev.map((r) =>
            r.uri === c.uri
              ? {
                  ...r,
                  likeCount: (r.likeCount ?? 0) + (liked ? -1 : 1),
                  viewer: liked ? undefined : { like: "__pending__" },
                }
              : r,
          ),
        );
      }

      try {
        if (liked) {
          await unlikeContent(c.viewer!.like!);
          if (c.uri === focalComment?.uri) {
            setFocalComment((prev) =>
              prev ? { ...prev, viewer: undefined } : prev,
            );
          } else {
            setDirectReplies((prev) =>
              prev.map((r) =>
                r.uri === c.uri ? { ...r, viewer: undefined } : r,
              ),
            );
          }
        } else {
          const likeUri = await likeContent(c.uri, c.cid);
          if (c.uri === focalComment?.uri) {
            setFocalComment((prev) =>
              prev ? { ...prev, viewer: { like: likeUri } } : prev,
            );
          } else {
            setDirectReplies((prev) =>
              prev.map((r) =>
                r.uri === c.uri ? { ...r, viewer: { like: likeUri } } : r,
              ),
            );
          }
        }
      } catch (err) {
        console.error("Failed to toggle like:", err);
        if (c.uri === focalComment?.uri) {
          setFocalComment((prev) =>
            prev
              ? {
                  ...prev,
                  likeCount: (prev.likeCount ?? 0) + (liked ? 1 : -1),
                  viewer: liked ? { like: c.viewer!.like! } : undefined,
                }
              : prev,
          );
        } else {
          setDirectReplies((prev) =>
            prev.map((r) =>
              r.uri === c.uri
                ? {
                    ...r,
                    likeCount: (r.likeCount ?? 0) + (liked ? 1 : -1),
                    viewer: liked ? { like: c.viewer!.like! } : undefined,
                  }
                : r,
            ),
          );
        }
      }
    },
    [focalComment],
  );

  const handleNavigateToComment = useCallback(
    (uri: string) => {
      if (onNavigateToComment) {
        onNavigateToComment(uri);
        return;
      }
      router.push(
        `/ballot/${id}/arguments/feed/comment?uri=${encodeURIComponent(uri)}`,
      );
    },
    [id, router, onNavigateToComment],
  );

  const handleNavigateToArgument = useCallback(() => {
    if (!argument) return;
    if (onNavigateToArgument) {
      onNavigateToArgument(argument.rkey);
      return;
    }
    router.push(`/ballot/${id}/arguments/${argument.rkey}`);
  }, [argument, onNavigateToArgument, id, router]);

  const handleReply = useCallback((uri: string) => {
    setReplyTarget(uri);
  }, []);

  const handleSubmitReply = useCallback(async () => {
    if (!replyText.trim() || submitting || !focalComment || !argument) return;
    const parentUri = replyTarget ?? focalComment.uri;
    setSubmitting(true);
    try {
      await createComment(argument.uri, "", replyText.trim(), parentUri);
      setReplyText("");
      const allCmts = await listComments(argument.uri);
      const commentMap = new Map<string, CommentWithMetadata>();
      for (const c of allCmts) {
        commentMap.set(c.uri, { ...c, replies: [] });
      }
      for (const c of allCmts) {
        if (c.parentUri && commentMap.has(c.parentUri)) {
          commentMap.get(c.parentUri)!.replies!.push(commentMap.get(c.uri)!);
        }
      }
      const replies = allCmts
        .filter((c) => c.parentUri === focalComment.uri)
        .map((c) => commentMap.get(c.uri)!);
      setDirectReplies(replies);
      setReplyTarget(null);
    } catch (err) {
      console.error("Failed to submit reply:", err);
    } finally {
      setSubmitting(false);
    }
  }, [replyText, submitting, focalComment, argument, replyTarget]);

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
    <ArgumentContextBox
      title={argument.title}
      body={argument.body}
      type={argument.type}
      likeCount={argument.likeCount}
      commentCount={argument.commentCount}
      reviewStatus={argument.reviewStatus}
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
          onLikeToggle={handleLikeToggle}
          onReply={handleReply}
          activeComposerUri={replyTarget}
          renderComposer={renderComposer}
        />
      ))}

      <PostRow
        comment={focalComment}
        focal
        showLineTop={ancestors.length > 0}
        onLikeToggle={handleLikeToggle}
        onReply={handleReply}
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
              onLikeToggle={handleLikeToggle}
              onReply={handleReply}
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
