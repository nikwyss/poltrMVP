"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { RelevanceRating } from "@/components/relevance-rating";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { rateContent } from "@/lib/ballots";
import { isPdsError, pdsErrorKey, type PdsError } from "@/lib/pdsError";
import { notifyPdsError } from "@/lib/toast";

// ---------------------------------------------------------------------------
// Comment node (recursive, clickable)
// ---------------------------------------------------------------------------

// Sentinel target for the top-level comment composer (vs. a comment uri reply).
const ROOT_TARGET = "__root__";

// Bewertungen werden gebündelt: schnelle Reglerbewegungen / +–-Klicks lösen nur
// EINEN Netzwerk-Write aus (letzter Wert), nach dieser Ruhephase in ms.
const RATE_DEBOUNCE_MS = 1000;

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
  onRated,
  backLabel,
}: {
  isOverlay?: boolean;
  onClose?: () => void;
  argRkeyOverride?: string;
  onNavigateToComment?: (uri: string) => void;
  // Called after a rating changes so a host (e.g. the booklet list) can reflect
  // it live without a refetch. `null` = rating cleared / rolled back to unrated.
  onRated?: (argUri: string, preference: number | null) => void;
  backLabel?: string;
} = {}) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const ballotRkey = params.id as string;
  const argRkey = argRkeyOverride ?? (params.argRkey as string);
  const t = useTranslations("argumentDetail");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const tbk = useTranslations("booklet");

  const [argument, setArgument] = useState<ArgumentWithMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Relevanz-Bewertung des Users (1–100) oder null, wenn noch nicht bewertet.
  // Initial aus `argument.viewer.preference` (vom AppView angereichert).
  const [relevance, setRelevance] = useState<number | null>(null);
  // Letzter erfolgreich persistierter Wert — Rollback-Baseline bei Fehlern.
  const committedRelevance = useRef<number | null>(null);

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
    commentError,
  } = useCommentThread({ onError: (e) => notifyPdsError(te, e) });

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
        setRelevance(arg.viewer?.preference ?? null);
        committedRelevance.current = arg.viewer?.preference ?? null;
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

  // Gebündelter Netzwerk-Write (idempotent serverseitig, deterministischer rkey).
  // Das optimistische UI-Update hat `handleRateCommit` bereits angewandt; hier feuert
  // nur noch der eigentliche POST — nach RATE_DEBOUNCE_MS Ruhe mit dem letzten Wert.
  const { debounced: debouncedRate } = useDebouncedCallback(
    (uri: string, cid: string, value: number) => {
      // Rollback-Baseline = letzter erfolgreich persistierter Wert. Zwischenschritte
      // berühren `committedRelevance` nicht, daher stimmt der Wert hier.
      const prev = committedRelevance.current;
      rateContent(uri, cid, value)
        .then(() => {
          committedRelevance.current = value;
        })
        .catch((err) => {
          setRelevance(prev);
          onRated?.(uri, prev);
          notifyPdsError(
            te,
            isPdsError(err)
              ? err
              : ({ code: "unknown", status: 0 } as PdsError),
          );
        });
    },
    RATE_DEBOUNCE_MS,
  );

  // Bewertung persistieren (beim Loslassen des Reglers / +–-Buttons).
  const handleRateCommit = (value: number) => {
    if (!argument) return;
    const uri = argument.uri;
    setRelevance(value); // sofortiges optimistisches UI
    onRated?.(uri, value); // sofortiges Update des Eltern-Elements (Booklet-Karte)
    debouncedRate(uri, argument.cid, value); // gebündelter Netzwerk-Write
  };

  const handleSubmitComment = () => {
    if (!argument) return;
    const parentUri =
      replyTarget && replyTarget !== ROOT_TARGET ? replyTarget : undefined;
    submitComment(argument.uri, parentUri);
  };

  const renderComposer = () => (
    <div className="space-y-2">
      {commentError && (
        <Alert variant="destructive">
          <AlertDescription>{te(pdsErrorKey(commentError))}</AlertDescription>
        </Alert>
      )}
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
    </div>
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
  const accentColor = isPro ? "var(--pro)" : "var(--contra)";
  // Linker Karten-Balken wie im Booklet (kräftiges Grün/Rot, nicht das gedämpfte Pro/Contra).
  const cardAccent = isPro ? "var(--green)" : "var(--red)";

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
      <div
        className="ov-card"
        style={{ borderLeft: `5px solid ${argument ? cardAccent : "var(--line)"}` }}
      >
        {/* Karten-Optik wie im Booklet — lokal gescoped, damit das Overlay aus Feed
            wie Booklet identisch aussieht (na-* Klassen sind dort nicht verfügbar). */}
        <style jsx>{`
          .ov-card {
            height: 100%;
            display: flex;
            flex-direction: column;
            background: #fff8ef;
            border: 1px solid var(--line);
            border-radius: 12px;
            overflow-y: auto;
            box-shadow: 0 30px 70px -20px rgba(45, 35, 22, 0.45);
          }
          .ov-arg {
            display: flex;
            flex-direction: column;
            gap: 11px;
          }
          .ov-arg-top {
            display: flex;
            align-items: center;
            gap: 9px;
          }
          .ov-badge {
            flex-shrink: 0;
            font-size: 0.6875rem;
            font-weight: 700;
            letter-spacing: 0.02em;
            padding: 3px 10px;
            border-radius: var(--r-full, 999px);
          }
          .ov-badge-pro {
            background: var(--green-dim);
            color: var(--green);
          }
          .ov-badge-contra {
            background: var(--red-dim);
            color: var(--red);
          }
          .ov-arg-title {
            margin: 0;
            font-family: var(--font-serif), Georgia, "Times New Roman", serif;
            font-size: 1.25rem;
            font-weight: 600;
            line-height: 1.25;
            letter-spacing: -0.01em;
            color: var(--text);
          }
          .ov-arg-body {
            margin: 0;
            font-size: 0.9375rem;
            line-height: 1.55;
            color: var(--text-mid);
          }
          .ov-arg-meta {
            display: flex;
            gap: 16px;
            align-items: center;
            flex-wrap: wrap;
            font-size: 0.75rem;
            color: var(--text-mid);
          }
        `}</style>

        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-[#fff8ef]/95 backdrop-blur-sm border-b flex items-center px-5 py-3">
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
              <span className="text-muted-foreground">
                {t("loadingArgument")}
              </span>
            </div>
          )}

          {!loading && argument && (
            <>
              {/* Argument — gleiche Optik wie die Booklet-Karten (Badge + Serif-Titel) */}
              <div className="ov-arg">
                <div className="ov-arg-top">
                  <span
                    className={`ov-badge ov-badge-${isPro ? "pro" : "contra"}`}
                  >
                    {isPro ? tbk("proArgument") : tbk("contraArgument")}
                  </span>
                </div>
                <h2 className="ov-arg-title">{argument.record.title}</h2>
                {argument.record.body && (
                  <p className="ov-arg-body">{argument.record.body}</p>
                )}
                <div className="ov-arg-meta">
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
              </div>

              {/* Relevanz-Bewertung */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
                  {t("yourRating")}
                </div>
                <RelevanceRating
                  value={relevance}
                  onChange={setRelevance}
                  onCommit={handleRateCommit}
                />
              </div>

              <Separator />

              {/* Comments */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
                  {t("comments")}
                  {roots.length > 0 ? ` (${roots.length})` : ""}
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

          {/* Relevanz-Bewertung */}
          <Card>
            <CardContent className="pt-5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
                {t("yourRating")}
              </div>
              <RelevanceRating
                value={relevance}
                onChange={setRelevance}
                onCommit={handleRateCommit}
                accent={isPro ? "pro" : "contra"}
              />
            </CardContent>
          </Card>

          {/* Comments thread */}
          <Card>
            <CardContent className="pt-5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 border-b pb-2">
                {t("comments")} {roots.length > 0 ? `(${roots.length})` : ""}
              </div>
              {commentsBlock}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
