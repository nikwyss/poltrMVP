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
import { useArgumentQuery } from "@/lib/queries/arguments";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/spinner";
import { ReviewForm } from "@/components/review-form";
import { ProContraBadge } from "@/components/pro-contra-badge";
import { useOverlay } from "@/lib/overlay";
import { CheckCircle2, ArrowUp, ArrowDown } from "lucide-react";

// Peer-review (Gutachten) detail overlay.
//
// Zwei Modi, je nach Beziehung des Nutzers zum Argument:
//  - offene Einladung für dieses Argument → Reviewer-Formular (ReviewForm).
//  - sonst → Status-Ansicht (Lifecycle-State + Stimmen-Zähler).
//
// Die Status-Ansicht (u.a. direkt nach dem Einreichen) zeigt das begutachtete
// Argument (mit „Volles Argument anzeigen"), die Meta-Kacheln, die Stimmen und
// die Kriterien-Statistik.
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
            {/* Schlankes Erfolgs-Banner statt langem „Danke"-Kasten. */}
            {submitted && (
              <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
                <CheckCircle2 className="size-4 shrink-0 text-green-600" />
                {t("submittedNote")}
              </div>
            )}

            {/* Das begutachtete Argument — Kontext direkt im Overlay. */}
            {ballotRkey && argRkey && (
              <ArgumentContextInline ballotRkey={ballotRkey} argRkey={argRkey} />
            )}

            {/* Meta als zwei kompakte Kacheln: Über-Status + Anzahl Gutachten. */}
            <div className="grid grid-cols-2 gap-2">
              <StatTile
                label={t("tileStatus")}
                value={statusLabel(t, status.peerreviewStatus)}
                valueClassName={
                  status.peerreviewStatus === "approved"
                    ? "text-green-700"
                    : status.peerreviewStatus === "rejected"
                      ? "text-red-700"
                      : ""
                }
              />
              <StatTile
                label={t("tileProgress")}
                value={`${status.totalReviews}/${status.quorum}`}
              />
            </div>

            {/* Stimmen mit farbigen Pfeilen (grün/rot). */}
            <div className="flex items-center gap-4 text-sm">
              <span className="inline-flex items-center gap-1 font-semibold text-green-700">
                <ArrowUp className="size-4" />
                {status.approvals}
              </span>
              <span className="inline-flex items-center gap-1 font-semibold text-red-700">
                <ArrowDown className="size-4" />
                {status.rejections}
              </span>
              <span className="text-muted-foreground">{t("votes")}</span>
            </div>

            {/* Kriterien-Statistik: wie viele Gutachter je Kriterium wie bewertet
                haben (ok/beanstandet) — mit Verhältnis-Balken. */}
            {status.criteriaBreakdown && status.criteriaBreakdown.length > 0 && (
              <div className="border-t pt-3">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  {t("criteriaBreakdown")}
                </div>
                <ul className="space-y-2.5">
                  {status.criteriaBreakdown.map((c) => {
                    const total = c.ok + c.flagged;
                    const okPct = total > 0 ? (c.ok / total) * 100 : 0;
                    const flaggedPct = total > 0 ? (c.flagged / total) * 100 : 0;
                    return (
                      <li key={c.key}>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="truncate">{c.label}</span>
                          <span className="shrink-0 tabular-nums text-xs">
                            <span className="font-medium text-green-700">
                              {c.ok} {t("okShort")}
                            </span>
                            <span className="text-muted-foreground"> · </span>
                            <span className="font-medium text-red-700">
                              {c.flagged} {t("flaggedShort")}
                            </span>
                          </span>
                        </div>
                        <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="bg-green-500" style={{ width: `${okPct}%` }} />
                          <div className="bg-red-500" style={{ width: `${flaggedPct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type TFn = (key: string) => string;

// Ein einziger Über-Status: Angenommen / Abgelehnt / Unter Begutachtung.
function statusLabel(t: TFn, s: PeerreviewStatus["peerreviewStatus"]): string {
  switch (s) {
    case "approved":
      return t("outcomeApproved");
    case "rejected":
      return t("outcomeRejected");
    default:
      return t("outcomeReview");
  }
}

// Eine kompakte Meta-Kachel (Label oben, Wert unten).
function StatTile({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-md border bg-background px-2 py-2 text-center">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${valueClassName ?? ""}`}>{value}</div>
    </div>
  );
}

// Kompakte Argument-Vorschau im Status-Overlay (Ja/Nein-Badge + Titel + Kurztext),
// damit der Gutachter den Kontext direkt vor sich hat.
function ArgumentContextInline({
  ballotRkey,
  argRkey,
}: {
  ballotRkey: string;
  argRkey: string;
}) {
  const { data: argument = null } = useArgumentQuery(ballotRkey, argRkey, true);
  const tc = useTranslations("common");
  const tf = useTranslations("feed");
  const tg = useTranslations("gutachten");
  const { navigate } = useOverlay();
  if (!argument) return null;
  const type = argument.record.type;
  const isPro = type === "PRO";
  const label = tf("stanceOption", { stance: isPro ? tc("pro") : tc("contra") });
  return (
    <div
      className="rounded-lg bg-muted p-4"
      style={{ borderLeft: `4px solid ${isPro ? "var(--pro)" : "var(--contra)"}` }}
    >
      <div className="mb-2">
        <ProContraBadge type={type.toLowerCase()} variant="soft" label={label} />
      </div>
      <h3 className="m-0 mb-1 text-base font-semibold leading-snug">{argument.record.title}</h3>
      <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground line-clamp-3">
        {argument.record.body}
      </p>
      {/* Öffnet das volle Argument-Overlay (auf dem Overlay-Stack). */}
      <button
        type="button"
        onClick={() => navigate({ type: "argument", rkey: argRkey })}
        className="mt-2 text-xs font-medium text-primary hover:underline"
      >
        {tg("showFullArgument")}
      </button>
    </div>
  );
}

export default PeerReviewDetail;
