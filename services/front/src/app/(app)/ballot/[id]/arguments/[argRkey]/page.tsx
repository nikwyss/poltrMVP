"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/AuthContext";
import { listArguments, listComments, createComment } from "@/lib/agent";
import { likeContent, unlikeContent } from "@/lib/ballots";
import { formatRelativeTime } from "@/lib/utils";
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
import { CantonAvatar, BskyAvatar } from "@/components/canton-avatar";
import { ReplyInput } from "@/components/reply-input";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Comment node (recursive, clickable)
// ---------------------------------------------------------------------------

function CommentNode({
  comment,
  depth,
  onLikeToggle,
  onReply,
  onNavigate,
}: {
  comment: CommentWithMetadata;
  depth: number;
  onLikeToggle: (c: CommentWithMetadata) => void;
  onReply: (parentUri: string) => void;
  onNavigate: (uri: string) => void;
}) {
  const tc = useTranslations("common");
  const indent =
    typeof window !== "undefined" && window.innerWidth < 640 ? 16 : 24;
  const isExtern = comment.origin === "extern";
  const liked = !!comment.viewer?.like;

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
        {isExtern ? (
          <BskyAvatar size={28} />
        ) : (
          <CantonAvatar
            canton={comment.author.canton}
            color={comment.author.color}
            size={28}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">
              {isExtern
                ? comment.author.handle ||
                  comment.author.displayName ||
                  tc("bluesky")
                : comment.author.displayName || tc("anonymous")}
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
          <div className="text-sm leading-normal mt-0.5">
            {comment.record.body}
          </div>
          <div className="flex gap-3.5 mt-1 text-xs text-muted-foreground">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onLikeToggle(comment);
              }}
              className="bg-transparent border-none p-0 cursor-pointer text-xs"
              style={{ color: liked ? "var(--brand)" : "#8e8e8e" }}
            >
              {liked ? "\u2764" : "\u2661"}{" "}
              {(comment.likeCount ?? 0) > 0 ? comment.likeCount : ""}
            </button>
            {!isExtern && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReply(comment.uri);
                }}
                className="bg-transparent border-none p-0 cursor-pointer text-xs text-muted-foreground"
              >
                {"\ud83d\udcac"} {tc("reply")}
              </button>
            )}
          </div>
        </div>
      </div>
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

export default function ArgumentDetailPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const ballotRkey = params.id as string;
  const argRkey = params.argRkey as string;
  const t = useTranslations("argumentDetail");
  const tc = useTranslations("common");

  const [argument, setArgument] = useState<ArgumentWithMetadata | null>(null);
  const [comments, setComments] = useState<CommentWithMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) router.push("/");
  }, [isAuthenticated, authLoading, router]);

  const loadComments = useCallback(async (argUri: string) => {
    const allCmts = await listComments(argUri);
    const map = new Map<string, CommentWithMetadata>();
    for (const c of allCmts) map.set(c.uri, { ...c, replies: [] });
    for (const c of allCmts) {
      if (c.parentUri && map.has(c.parentUri)) {
        map.get(c.parentUri)!.replies!.push(map.get(c.uri)!);
      }
    }
    return allCmts.filter((c) => !c.parentUri).map((c) => map.get(c.uri)!);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || authLoading || !ballotRkey || !argRkey) return;

    (async () => {
      setLoading(true);
      setError("");
      try {
        const args = await listArguments(ballotRkey);
        const arg = args.find((a) => a.uri.split("/").pop() === argRkey);
        if (!arg) throw new Error("Argument not found");
        setArgument(arg);
        setComments(await loadComments(arg.uri));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load argument",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated, authLoading, ballotRkey, argRkey, loadComments]);

  const handleLikeToggle = useCallback(async (c: CommentWithMetadata) => {
    const liked = !!c.viewer?.like;
    setComments((prev) =>
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
    try {
      if (liked) {
        await unlikeContent(c.viewer!.like!);
        setComments((prev) =>
          prev.map((r) => (r.uri === c.uri ? { ...r, viewer: undefined } : r)),
        );
      } else {
        const likeUri = await likeContent(c.uri, c.cid);
        setComments((prev) =>
          prev.map((r) =>
            r.uri === c.uri ? { ...r, viewer: { like: likeUri } } : r,
          ),
        );
      }
    } catch (err) {
      console.error("Failed to toggle like:", err);
      setComments((prev) =>
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
  }, []);

  const handleReply = useCallback(() => {
    replyInputRef.current?.focus();
  }, []);

  const handleNavigateToComment = useCallback(
    (uri: string) => {
      router.push(
        `/ballot/${ballotRkey}/feed/comment?uri=${encodeURIComponent(uri)}`,
      );
    },
    [ballotRkey, router],
  );

  const handleSubmitComment = useCallback(async () => {
    if (!replyText.trim() || submitting || !argument) return;
    setSubmitting(true);
    try {
      await createComment(argument.uri, "", replyText.trim());
      setReplyText("");
      setComments(await loadComments(argument.uri));
    } catch (err) {
      console.error("Failed to submit comment:", err);
    } finally {
      setSubmitting(false);
    }
  }, [replyText, submitting, argument, loadComments]);

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

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Button
        variant="outline"
        size="sm"
        onClick={() => router.push(`/ballot/${ballotRkey}/arguments`)}
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
              borderLeft: `4px solid ${isPro ? "var(--green)" : "var(--red)"}`,
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
                    {"\u2661"} {argument.likeCount}
                  </span>
                )}
                {(argument.commentCount ?? 0) > 0 && (
                  <span>
                    {"\ud83d\udcac"} {argument.commentCount}
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
                {comments.length > 0 ? `(${comments.length})` : ""}
              </div>

              {comments.length === 0 ? (
                <p className="text-muted-foreground text-sm m-0">
                  {t("noComments")}
                </p>
              ) : (
                comments.map((c) => (
                  <CommentNode
                    key={c.uri}
                    comment={c}
                    depth={0}
                    onLikeToggle={handleLikeToggle}
                    onReply={handleReply}
                    onNavigate={handleNavigateToComment}
                  />
                ))
              )}
            </CardContent>
          </Card>

          {/* Comment input */}
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-xs text-muted-foreground mb-1.5">
                {t("addComment")}
              </div>
              <ReplyInput
                ref={replyInputRef}
                value={replyText}
                onChange={setReplyText}
                onSubmit={handleSubmitComment}
                submitting={submitting}
                placeholder={t("commentPlaceholder")}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
