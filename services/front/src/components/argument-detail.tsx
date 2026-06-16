"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/AuthContext";
import { buildCommentMap, rootComments } from "@/lib/commentThread";
import { useCommentThread } from "@/hooks/useCommentThread";
import type { CommentWithMetadata } from "@/types/ballots";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/spinner";
import {
  PeerreviewStatusBadge,
  OfficialBadge,
  OfficialStar,
  isOfficialArgument,
} from "@/components/pro-contra-badge";
import { CommentAvatar, CommentContent } from "@/components/comment-content";
import { ReplyInput } from "@/components/reply-input";
import { RelevanceRating } from "@/components/relevance-rating";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import {
  useArgumentQuery,
  useArgumentRatingCache,
  useRateArgumentMutation,
} from "@/lib/queries/arguments";
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
        data-overlay-anchor={comment.uri}
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
// Detail component — rendered exclusively inside the overlay (the previous
// standalone `/ballot/X/arguments/Y` route was removed).
//
// `ballotRkey` is read from URL params via `useParams()`. That works while the
// overlay is opened from a `/ballot/[id]/…` route; opening this overlay from
// elsewhere (e.g. global notification list) would require threading ballotRkey
// through the OverlayEntry — future work.
// ---------------------------------------------------------------------------

export function ArgumentDetail({
  onClose,
  argRkey,
  onNavigateToComment,
  onNavigateToTaxonomy,
  backLabel,
  registerScrollContainer,
}: {
  onClose: () => void;
  argRkey: string;
  onNavigateToComment: (uri: string) => void;
  // Klick auf ein Taxonomie-Breadcrumb → öffnet diese Topic-Stufe im Overlay.
  onNavigateToTaxonomy: (ballotRkey: string, topic: string) => void;
  backLabel: string;
  // Overlay host hands us a setter for *its* scroll-position tracking. We pass
  // the element that actually scrolls (the .ov-card wrapper); the host saves
  // and restores its scrollTop across history-navigation.
  registerScrollContainer: (el: HTMLElement | null) => void;
}) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const ballotRkey = params.id as string;
  const t = useTranslations("argumentDetail");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const tbk = useTranslations("booklet");

  // Argument aus dem zentralen Query-Cache (Key `argumentKeys.detail`). Derselbe
  // Präfix, den `useArgumentRatingCache` patcht — Booklet-Liste und dieses
  // Detail teilen damit eine Quelle für `viewer.preference`.
  const enabled = isAuthenticated && !authLoading && !!ballotRkey && !!argRkey;
  const {
    data: argument = null,
    isPending,
    error: argError,
  } = useArgumentQuery(ballotRkey, argRkey, enabled);
  const loading = enabled && isPending;
  const error = argError
    ? argError instanceof Error
      ? argError.message
      : "Failed to load argument"
    : "";

  // Relevanz-Bewertung des Users (1–100) oder null, wenn noch nicht bewertet.
  // Lokaler State für den Slider (Live-Drag); aus dem geladenen Argument geseedet.
  const [relevance, setRelevance] = useState<number | null>(null);
  // Letzter erfolgreich persistierter Wert — Rollback-Baseline bei Fehlern.
  const committedRelevance = useRef<number | null>(null);

  const {
    comments,
    commentsLoading,
    toggleLike,
    submitComment,
    replyText,
    setReplyText,
    submitting,
    replyTarget,
    setReplyTarget,
    replyInputRef,
    commentError,
  } = useCommentThread(argument?.uri, { onError: (e) => notifyPdsError(te, e) });

  // Derive the top-level comment tree from the flat list.
  const roots = useMemo(() => {
    const map = buildCommentMap(comments);
    return rootComments(comments, map);
  }, [comments]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) router.push("/");
  }, [isAuthenticated, authLoading, router]);

  // Slider-State aus dem geladenen Argument seeden — nur bei Argumentwechsel
  // (Key = uri), damit ein Cache-Patch durch die eigene Bewertung den lokalen
  // Wert nicht zurücksetzt.
  useEffect(() => {
    const pref = argument?.viewer?.preference ?? null;
    setRelevance(pref);
    committedRelevance.current = pref;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [argument?.uri]);

  // Composer NICHT automatisch öffnen — der Kommentarbereich startet stets
  // eingeklappt (Button „Kommentar verfassen"). Beim Argumentwechsel eine
  // ggf. offene Eingabe zurücksetzen, damit das Overlay nicht mit aktivem
  // (fokussiertem) Feld in das nächste Argument übergeht.
  useEffect(() => {
    setReplyTarget(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [argument?.uri]);

  // Bewertung in den zentralen Query-Cache spiegeln (Booklet-Liste + ggf.
  // Detail). Das ersetzt den früheren `onRated`-Callback an die Host-Seite.
  const patchRating = useArgumentRatingCache(ballotRkey);
  const rateMutation = useRateArgumentMutation();

  // Gebündelter Netzwerk-Write (idempotent serverseitig, deterministischer rkey).
  // Das optimistische UI-Update hat `handleRateCommit` bereits angewandt; hier feuert
  // nur noch der eigentliche POST — nach RATE_DEBOUNCE_MS Ruhe mit dem letzten Wert.
  const { debounced: debouncedRate } = useDebouncedCallback(
    (uri: string, cid: string, value: number) => {
      // Rollback-Baseline = letzter erfolgreich persistierter Wert. Zwischenschritte
      // berühren `committedRelevance` nicht, daher stimmt der Wert hier.
      const prev = committedRelevance.current;
      rateMutation.mutate(
        { uri, cid, preference: value },
        {
          onSuccess: () => {
            committedRelevance.current = value;
          },
          onError: (err) => {
            setRelevance(prev); // lokalen Slider zurückrollen
            patchRating(uri, prev); // Booklet-Karte zurückrollen
            notifyPdsError(
              te,
              isPdsError(err)
                ? err
                : ({ code: "unknown", status: 0 } as PdsError),
            );
          },
        },
      );
    },
    RATE_DEBOUNCE_MS,
  );

  // Bewertung persistieren (beim Loslassen des Reglers / +–-Buttons).
  const handleRateCommit = (value: number) => {
    if (!argument) return;
    const uri = argument.uri;
    setRelevance(value); // sofortiges optimistisches UI (Slider/Score im Overlay)
    patchRating(uri, value); // sofortiges Update der Booklet-Karte via Cache
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
  const isOfficial = isOfficialArgument(argument?.record.source);

  return (
    <div ref={registerScrollContainer} className="ov-card">
      {/* Karten-Optik wie im Booklet — lokal gescoped, damit das Overlay aus Feed
          wie Booklet identisch aussieht (na-* Klassen sind dort nicht verfügbar). */}
      <style jsx>{`
        .ov-card {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: var(--background);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow-y: auto;
          box-shadow: 0 30px 70px -20px rgba(45, 35, 22, 0.45);
        }
        /* Weisse Hero-Card (volle Breite): trägt Argument + Bewertung, vom
           cremefarbenen Overlay-Grund klar abgehoben. */
        .ov-arg-card {
          background: #fff;
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 24px;
          box-shadow: 0 1px 3px rgba(45, 35, 22, 0.05);
        }
        @media (min-width: 768px) {
          .ov-arg-card {
            padding: 28px 32px;
          }
        }
        .ov-arg {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        /* Trennlinie zwischen Argument und Bewertung innerhalb der Card. */
        .ov-arg-divider {
          height: 1px;
          background: var(--border);
          margin: 22px 0;
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
          background: var(--pro-dim);
          color: var(--pro);
        }
        .ov-badge-contra {
          background: var(--contra-dim);
          color: var(--contra);
        }
        .ov-arg-title {
          margin: 0;
          font-family: var(--font-serif), Georgia, "Times New Roman", serif;
          font-size: 1.5rem;
          font-weight: 600;
          line-height: 1.2;
          letter-spacing: -0.015em;
          color: var(--text);
        }
        .ov-arg-body {
          margin: 0;
          font-size: 1.0625rem;
          line-height: 1.65;
          color: var(--text-mid);
        }
        /* Ab Tablet darf der Titel als Hero noch grösser werden. */
        @media (min-width: 768px) {
          .ov-arg-title {
            font-size: 1.75rem;
          }
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
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b flex items-center px-5 py-3">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="text-base leading-none">←</span>
          {backLabel}
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
            {/* Weisse Hero-Card (volle Breite): Argument (Badge + Serif-Titel +
                Text) und darunter — durch eine Trennlinie abgesetzt — die
                Bewertung. */}
            <div className="ov-arg-card">
              <div className="ov-arg">
              {/* Topic-Taxonomie als Breadcrumbs (Beschreibung je Segment als
                  Tooltip). Multi-Membership → je Pfad eine Zeile. */}
              {argument.topicPaths && argument.topicPaths.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  {argument.topicPaths.map((path, pi) => (
                    <nav
                      key={pi}
                      className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground"
                    >
                      {path.map((seg, si) => (
                        <span key={si} className="flex items-center gap-x-1">
                          {si > 0 && <span className="opacity-40">›</span>}
                          {seg.key ? (
                            <button
                              type="button"
                              title={seg.description ?? undefined}
                              onClick={() => onNavigateToTaxonomy(ballotRkey, seg.key!)}
                              className="hover:text-foreground hover:underline"
                            >
                              {seg.name}
                            </button>
                          ) : (
                            <span
                              title={seg.description ?? undefined}
                              className="cursor-default"
                            >
                              {seg.name}
                            </span>
                          )}
                        </span>
                      ))}
                    </nav>
                  ))}
                </div>
              )}
              <div className="ov-arg-top">
                <span
                  className={`ov-badge ov-badge-${isPro ? "pro" : "contra"}`}
                >
                  {isPro ? tbk("proArgument") : tbk("contraArgument")}
                </span>
              </div>
              <h2 className="ov-arg-title">
                {argument.record.title}
                {isOfficial && <OfficialStar />}
              </h2>
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
                {isOfficial ? (
                  <OfficialBadge />
                ) : (
                  <PeerreviewStatusBadge status={argument.peerreviewStatus} />
                )}
              </div>
            </div>

              {/* Trennlinie + Bewertung — innerhalb derselben weissen Card.
                  Header/Status/Endlabels bringt die RelevanceRating selbst mit. */}
              <div className="ov-arg-divider" />
              <RelevanceRating
                value={relevance}
                onChange={setRelevance}
                onCommit={handleRateCommit}
                accent={isPro ? "pro" : "contra"}
              />
            </div>

            {/* Comments */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
                {t("comments")}
                {roots.length > 0 ? ` (${roots.length})` : ""}
              </div>
              {roots.length === 0 && replyTarget !== ROOT_TARGET && (
                <p className="text-muted-foreground text-sm m-0">
                  {t("noComments")}
                </p>
              )}
              {roots.length > 0 &&
                roots.map((c) => (
                  <CommentNode
                    key={c.uri}
                    comment={c}
                    depth={0}
                    onLikeToggle={toggleLike}
                    onReply={setReplyTarget}
                    onNavigate={onNavigateToComment}
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}
