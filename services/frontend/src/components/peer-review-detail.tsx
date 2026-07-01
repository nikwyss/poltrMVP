"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  getPeerreviewStatus,
  getPendingPeerreviews,
  getPeerreviewCriteria,
} from "@/lib/agent";
import type {
  PeerreviewStatus,
  PeerreviewInvitation,
  PeerreviewCriterion,
} from "@/types/ballots";
import { useArgumentQuery, useArgumentRating } from "@/lib/queries/arguments";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/spinner";
import { ReviewForm } from "@/components/review-form";
import { RelevanceRating } from "@/components/relevance-rating";

// Peer-review (Gutachten) detail overlay.
//
// Zwei Modi, je nach Beziehung des Nutzers zum Argument:
//  - offene Einladung für dieses Argument → Reviewer-Formular (ReviewForm).
//  - sonst → Status-Ansicht (Lifecycle-State + Stimmen-Zähler).
//
// In der Status-Ansicht (u.a. direkt nach dem Einreichen) erscheint unter der
// Statistik zusätzlich die persönliche Bewertungsskala — dieselbe RelevanceRating
// wie in der Argument-Übersicht, damit jede:r die eigene Überzeugung angeben kann.
export function PeerReviewDetail({
  argumentUri,
  onClose,
  backLabel,
  registerScrollContainer,
}: {
  argumentUri: string;
  onClose: () => void;
  backLabel: string;
  registerScrollContainer: (el: HTMLElement | null) => void;
}) {
  const t = useTranslations("gutachten");
  const tc = useTranslations("common");
  const params = useParams();
  const ballotRkey = (params?.id as string) || "";
  const argRkey = argumentUri.split("/").pop() || "";

  const [status, setStatus] = useState<PeerreviewStatus | null>(null);
  const [invitation, setInvitation] = useState<PeerreviewInvitation | null>(null);
  const [criteria, setCriteria] = useState<PeerreviewCriterion[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      getPeerreviewStatus(argumentUri),
      getPendingPeerreviews().catch(() => [] as PeerreviewInvitation[]),
      getPeerreviewCriteria().catch(() => [] as PeerreviewCriterion[]),
    ])
      .then(([s, pending, crit]) => {
        if (cancelled) return;
        setStatus(s);
        setCriteria(crit);
        setInvitation(pending.find((inv) => inv.argumentUri === argumentUri) ?? null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [argumentUri]);

  const showForm = invitation && criteria.length > 0 && !submitted;

  return (
    <div
      ref={registerScrollContainer}
      className="h-full overflow-y-auto flex flex-col bg-[#fff8ef] rounded-2xl shadow-[0_30px_70px_-20px_rgba(45,35,22,0.45)]"
    >
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-[#fff8ef]/95 backdrop-blur-sm border-b flex items-center px-5 py-3">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="text-base leading-none">←</span>
          {backLabel}
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
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        )}

        {!loading && showForm && invitation && (
          <ReviewForm
            arg={{
              argumentUri: invitation.argumentUri,
              title: invitation.argument.title,
              body: invitation.argument.body,
              type: invitation.argument.type,
              ballotRkey: invitation.argument.ballotRkey,
            }}
            criteriaTemplate={criteria}
            onSubmitted={() => setSubmitted(true)}
          />
        )}

        {!loading && !showForm && status && (
          <div className="space-y-4">
            {submitted && (
              <Alert>
                <AlertDescription>{t("submittedNote")}</AlertDescription>
              </Alert>
            )}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t("statusOpen")}</dt>
              <dd className="font-semibold">{status.peerreviewStatus}</dd>
              <dt className="text-muted-foreground">{t("votes")}</dt>
              <dd className="font-semibold">
                {status.approvals}↑ · {status.rejections}↓ ·{" "}
                {status.totalReviews}/{status.quorum}
              </dd>
            </dl>

            {/* Kriterien-Auszählung (aggregiert: ok vs. beanstandet). */}
            {status.criteriaBreakdown && status.criteriaBreakdown.length > 0 && (
              <div className="border-t pt-3">
                <div className="text-xs text-muted-foreground mb-2">{t("criteriaBreakdown")}</div>
                <ul className="space-y-1">
                  {status.criteriaBreakdown.map((c) => (
                    <li key={c.key} className="flex items-center justify-between text-sm gap-3">
                      <span>{c.label}</span>
                      <span className="shrink-0 tabular-nums">
                        <span className="text-green-700 font-medium">
                          {c.ok} {t("okShort")}
                        </span>
                        <span className="text-muted-foreground"> · </span>
                        <span className="text-amber-700 font-medium">
                          {c.flagged} {t("flaggedShort")}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Persönliche Bewertung — wie in der Argument-Übersicht. */}
            {ballotRkey && argRkey && (
              <div className="border-t pt-4">
                <div className="max-w-[400px]">
                  <ArgumentRatingInline ballotRkey={ballotRkey} argRkey={argRkey} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Persönliche Überzeugungs-Bewertung eines Arguments (0–100) — dieselbe
// RelevanceRating + dieselbe Rating-Logik (useArgumentRating) wie die Argument-
// Übersicht; spiegelt in den gemeinsamen Argument-Cache (Booklet/Detail).
function ArgumentRatingInline({
  ballotRkey,
  argRkey,
}: {
  ballotRkey: string;
  argRkey: string;
}) {
  const { data: argument = null } = useArgumentQuery(ballotRkey, argRkey, true);
  const { relevance, setRelevance, commitRelevance } = useArgumentRating(ballotRkey, argument);

  if (!argument) return null;

  return (
    <RelevanceRating
      value={relevance}
      accent={argument.record.type === "CONTRA" ? "contra" : "pro"}
      onChange={setRelevance}
      onCommit={commitRelevance}
    />
  );
}

export default PeerReviewDetail;
