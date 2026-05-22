"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/AuthContext";
import { getArgument } from "@/lib/agent";
import { useScrollRestore, smartBack } from "@/lib/scrollRestore";
import { buildCommentMap, rootComments } from "@/lib/commentThread";
import { useCommentThread } from "@/hooks/useCommentThread";
import { Separator } from "@/components/ui/separator";
import type {
  ArgumentWithMetadata,
  CommentWithMetadata,
} from "@/types/ballots";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/spinner";
import {
  ProContraBadge,
  ReviewStatusBadge,
} from "@/components/pro-contra-badge";
import { CommentAvatar, CommentContent } from "@/components/comment-content";
import { ReplyInput } from "@/components/reply-input";

// ---------------------------------------------------------------------------
// Comment node (recursive, clickable)
// ---------------------------------------------------------------------------

// Sentinel target for the top-level comment composer (vs. a comment uri reply).
const ROOT_TARGET = "__root__";

function CommentNode({
  comment,
  depth,
  onLikeToggle,
  onReply,
  onNavigate,
  activeComposerUri,
  renderComposer,
}: {
  comment: CommentWithMetadata;
  depth: number;
  onLikeToggle: (c: CommentWithMetadata) => void;
  onReply: (parentUri: string) => void;
  onNavigate: (uri: string) => void;
  activeComposerUri?: string | null;
  renderComposer?: () => React.ReactNode;
}) {
  const indent =
    typeof window !== "undefined" && window.innerWidth < 640 ? 16 : 24;

  return (
    <div style={{ paddingLeft: depth > 0 ? indent : 0 }}>
      <div
        onClick={() => onNavigate(comment.uri)}
        className="flex gap-2 pt-2.5 pb-1.5 cursor-pointer"
        style={{
          borderLeft: depth > 0 ? "2px solid #e0e0e0" : "none",
          paddingLeft: depth > 0 ? 10 : 0,
        }}
      >
        <CommentAvatar comment={comment} size={28} />
        <div className="flex-1 min-w-0">
          <CommentContent
            comment={comment}
            onLikeToggle={onLikeToggle}
            onReply={onReply}
          />
        </div>
      </div>
      {comment.uri === activeComposerUri && renderComposer && (
        <div className="pl-9 pb-2">{renderComposer()}</div>
      )}
      {comment.replies && comment.replies.length > 0 && (
        <div>
          {comment.replies.map((r) => (
            <CommentNode
              key={r.uri}
              comment={r}
              depth={Math.min(depth + 1, 2)}
              onLikeToggle={onLikeToggle}
              onReply={onReply}
              onNavigate={onNavigate}
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
// Main page
// ---------------------------------------------------------------------------

export default function ArgumentDetailPage({
  isOverlay = false,
  onClose,
  argRkeyOverride,
  onNavigateToComment,
  backLabel,
}: {
  isOverlay?: boolean;
  onClose?: () => void;
  argRkeyOverride?: string;
  onNavigateToComment?: (uri: string) => void;
  backLabel?: string;
} = {}) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const ballotRkey = params.id as string;
  const argRkey = argRkeyOverride ?? (params.argRkey as string);
  const t = useTranslations("argumentDetail");
  const tc = useTranslations("common");

  const [argument, setArgument] = useState<ArgumentWithMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const {
    comments,
    reload,
    toggleLike,
    submitComment,
    replyText,
    setReplyText,
    submitting,
    replyTarget,
    setReplyTarget,
    replyInputRef,
  } = useCommentThread();

  // Derive the top-level comment tree from the flat list.
  const roots = useMemo(() => {
    const map = buildCommentMap(comments);
    return rootComments(comments, map);
  }, [comments]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) router.push("/");
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (!isAuthenticated || authLoading || !ballotRkey || !argRkey) return;

    (async () => {
      setLoading(true);
      setError("");
      try {
        const arg = await getArgument(ballotRkey, argRkey);
        setArgument(arg);
        const loaded = await reload(arg.uri);
        // No comments yet → open the top-level composer right away.
        setReplyTarget(loaded.length === 0 ? ROOT_TARGET : null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load argument",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [
    isAuthenticated,
    authLoading,
    ballotRkey,
    argRkey,
    reload,
    setReplyTarget,
  ]);

  const handleNavigateToComment = (uri: string) => {
    if (onNavigateToComment) {
      onNavigateToComment(uri);
      return;
    }
    router.push(
      `/ballot/${ballotRkey}/arguments/feed/comment?uri=${encodeURIComponent(uri)}`,
    );
  };

  const handleSubmitComment = () => {
    if (!argument) return;
    const parentUri =
      replyTarget && replyTarget !== ROOT_TARGET ? replyTarget : undefined;
    submitComment(argument.uri, parentUri);
  };

  const renderComposer = () => (
    <ReplyInput
      ref={replyInputRef}
      value={replyText}
      onChange={setReplyText}
      onSubmit={handleSubmitComment}
      submitting={submitting}
      placeholder={t("commentPlaceholder")}
      onCancel={() => {
        setReplyText("");
        setReplyTarget(null);
      }}
    />
  );

  useScrollRestore(!isOverlay && !loading && !!argument);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] gap-3">
        <Spinner />
        <span className="text-muted-foreground">{tc("restoringSession")}</span>
      </div>
    );
  }
  if (!isAuthenticated) return null;

  const isPro = argument?.record.type === "PRO";
  const accentColor = isPro ? "var(--green)" : "var(--red)";

  // ── Shared comments block (used by both overlay and full-page layouts) ──────
  const commentsBlock = (
    <>
      {roots.length === 0 && replyTarget !== ROOT_TARGET && (
        <p className="text-muted-foreground text-sm m-0">{t("noComments")}</p>
      )}
      {roots.length > 0 &&
        roots.map((c) => (
          <CommentNode
            key={c.uri}
            comment={c}
            depth={0}
            onLikeToggle={toggleLike}
            onReply={setReplyTarget}
            onNavigate={handleNavigateToComment}
            activeComposerUri={replyTarget}
            renderComposer={renderComposer}
          />
        ))}

      {/* Top-level composer / trigger */}
      <div className={roots.length > 0 ? "pt-3 mt-3 border-t" : "pt-1"}>
        {replyTarget === ROOT_TARGET ? (
          renderComposer()
        ) : (
          <Button
            variant="outline"
            className="w-full justify-center"
            onClick={() => setReplyTarget(ROOT_TARGET)}
          >
            💬 {t("writeComment")}
          </Button>
        )}
      </div>
    </>
  );

  // ── Overlay layout (rendered inside Dialog) ────────────────────────────────
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
            {backLabel ?? t("backToBallot")}
          </button>
        </div>

        <div className="px-5 py-6 space-y-6">
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
              <span className="text-muted-foreground">{t("loadingArgument")}</span>
            </div>
          )}

          {!loading && argument && (
            <>
              {/* Argument — prominent accent block */}
              <div
                className="pl-5 pr-2 py-1"
                style={{ borderLeft: `4px solid ${accentColor}` }}
              >
                <div className="flex items-start gap-3 mb-3">
                  <h2 className="text-xl font-bold flex-1 leading-snug m-0">
                    {argument.record.title}
                  </h2>
                  <ProContraBadge type={argument.record.type?.toLowerCase()} />
                </div>
                {argument.record.body && (
                  <p className="text-sm text-muted-foreground leading-relaxed m-0 mb-3">
                    {argument.record.body}
                  </p>
                )}
                <div className="flex gap-4 text-xs text-muted-foreground items-center flex-wrap">
                  {(argument.likeCount ?? 0) > 0 && (
                    <span>{"♡"} {argument.likeCount}</span>
                  )}
                  {(argument.commentCount ?? 0) > 0 && (
                    <span>{"💬"} {argument.commentCount}</span>
                  )}
                  <ReviewStatusBadge status={argument.reviewStatus} />
                </div>
              </div>

              <Separator />

              {/* Comments */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
                  {t("comments")}{roots.length > 0 ? ` (${roots.length})` : ""}
                </div>
                {commentsBlock}
              </div>
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
        onClick={() => smartBack(router, `/ballot/${ballotRkey}/arguments`)}
      >
        &larr; {t("backToBallot")}
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
            <span className="text-muted-foreground">
              {t("loadingArgument")}
            </span>
          </CardContent>
        </Card>
      )}

      {!loading && argument && (
        <>
          {/* Argument card */}
          <Card
            style={{
              borderLeft: `4px solid ${accentColor}`,
            }}
          >
            <CardContent className="pt-5">
              <div className="flex items-start gap-2.5 mb-2.5">
                <h2 className="m-0 text-lg font-bold flex-1 leading-snug">
                  {argument.record.title}
                </h2>
                <ProContraBadge type={argument.record.type?.toLowerCase()} />
              </div>

              {argument.record.body && (
                <p className="m-0 mb-3 text-sm text-muted-foreground leading-relaxed">
                  {argument.record.body}
                </p>
              )}

              <div className="flex gap-4 text-xs text-muted-foreground items-center">
                {(argument.likeCount ?? 0) > 0 && (
                  <span>
                    {"♡"} {argument.likeCount}
                  </span>
                )}
                {(argument.commentCount ?? 0) > 0 && (
                  <span>
                    {"💬"} {argument.commentCount}
                  </span>
                )}
                <ReviewStatusBadge status={argument.reviewStatus} />
              </div>
            </CardContent>
          </Card>

          {/* Comments thread */}
          <Card>
            <CardContent className="pt-5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 border-b pb-2">
                {t("comments")}{" "}
                {roots.length > 0 ? `(${roots.length})` : ""}
              </div>
              {commentsBlock}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
