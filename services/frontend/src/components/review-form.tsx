"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getDuplicateCandidate,
  submitPeerreview,
  checkInPeerreview,
  peerreviewActivity,
} from "@/lib/agent";
import type {
  PeerreviewCriterion,
  PeerreviewCriterionRating,
  CriterionAssessment,
  DuplicateCandidate,
  PeerreviewState,
} from "@/types/ballots";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/spinner";
import { ProContraBadge } from "@/components/pro-contra-badge";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Info, Check, X } from "lucide-react";

const NON_DUP_KEY = "non_duplication";
const ACTIVITY_THROTTLE_MS = 30_000;
const DRAFT_PREFIX = "poltr.review.draft.";

type CheckGate = "checking" | "ready" | "closed" | "too_late";

export interface ReviewableArgument {
  argumentUri: string;
  title: string;
  body: string;
  type: "PRO" | "CONTRA";
  ballotRkey: string;
}

interface DraftShape {
  assessments: Record<string, CriterionAssessment | null>;
  vote: "APPROVE" | "REJECT" | null;
}

// Reviewer-Formular für EIN Argument — geteilt zwischen /review-Dashboard und
// Gutachten-Overlay. Entscheid 2026-06-30 (doc/ARGUMENT_CRITERIA.md):
//  - Gesamturteil ja/nein („aufnehmen?") = vote; pro Kriterium ok/beanstandet.
//  - „Kein Duplikat" nur bei Live-Treffer; bestätigtes Duplikat wählt „nein" vor.
//  - keine Stufe-1-LLM-Bewertung sichtbar (frisches Urteil).
// Lifecycle: check-in beim Öffnen (sperrt das Formular bei closed/too_late),
// throttled activity-Ping beim Tippen, Grace-Countdown bei provisional_closed,
// localStorage-Backup des Entwurfs (übersteht ein „review_closed" beim Submit).
export function ReviewForm({
  arg,
  criteriaTemplate,
  onSubmitted,
}: {
  arg: ReviewableArgument;
  criteriaTemplate: PeerreviewCriterion[];
  onSubmitted: (argumentUri: string) => void;
}) {
  const t = useTranslations("review");
  const tc = useTranslations("common");
  const tf = useTranslations("feed");
  const draftKey = DRAFT_PREFIX + arg.argumentUri;

  // „Ja-Argument" / „Nein-Argument" (wie im Composer) statt nur „Ja"/„Nein".
  const stanceArgLabel = (type?: string) =>
    tf("stanceOption", {
      stance: (type || "").toUpperCase() === "PRO" ? tc("pro") : tc("contra"),
    });

  // Default: nichts vorgewählt (null). Der Gutachter setzt pro Kriterium bewusst
  // ein Signal (ok/beanstandet) — oder lässt es leer. Klick auf den aktiven
  // Zustand deselektiert wieder.
  const [assessments, setAssessments] = useState<Record<string, CriterionAssessment | null>>(() =>
    Object.fromEntries(criteriaTemplate.map((c) => [c.key, null]))
  );
  const [vote, setVote] = useState<"APPROVE" | "REJECT" | null>(null);
  const [voteTouched, setVoteTouched] = useState(false);
  const [dup, setDup] = useState<DuplicateCandidate | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const [gate, setGate] = useState<CheckGate>("checking");
  const [reviewState, setReviewState] = useState<PeerreviewState | null>(null);
  const [graceUntil, setGraceUntil] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  const lastPingRef = useRef(0);

  // Erklärung je Kriterium (für die bekannten Keys; sonst keine).
  const descFor = (key: string): string => {
    switch (key) {
      case "coherence":
        return t("critDescCoherence");
      case "tone":
        return t("critDescTone");
      case "topic":
        return t("critDescTopic");
      case "unity":
        return t("critDescUnity");
      default:
        return "";
    }
  };

  // Kurzer One-Liner (Hauptaussage) je Kriterium — sichtbar unter dem Label.
  const shortFor = (key: string): string => {
    switch (key) {
      case "coherence":
        return t("critShortCoherence");
      case "tone":
        return t("critShortTone");
      case "topic":
        return t("critShortTopic");
      case "unity":
        return t("critShortUnity");
      default:
        return "";
    }
  };

  // --- Draft restore + check-in + duplicate candidate (on mount) -------------
  useEffect(() => {
    let cancelled = false;

    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw) as DraftShape;
        if (d.assessments) setAssessments((prev) => ({ ...prev, ...d.assessments }));
        if (d.vote) {
          setVote(d.vote);
          setVoteTouched(true);
        }
      }
    } catch {
      /* ignore corrupt draft */
    }

    checkInPeerreview(arg.argumentUri).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setReviewState(r.state);
        setGraceUntil(r.graceUntil);
        setGate(r.state === "closed" ? "closed" : "ready");
      } else if (r.error === "closed") {
        setGate("closed");
      } else if (r.error === "too_late") {
        setGate("too_late");
      } else {
        setGate("ready");
      }
    });

    getDuplicateCandidate(arg.argumentUri).then((r) => {
      if (!cancelled) setDup(r.items[0] ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, [arg.argumentUri, draftKey]);

  // --- Persist draft on change ----------------------------------------------
  useEffect(() => {
    if (done) return;
    try {
      const d: DraftShape = { assessments, vote };
      localStorage.setItem(draftKey, JSON.stringify(d));
    } catch {
      /* storage full / unavailable — non-critical */
    }
  }, [assessments, vote, done, draftKey]);

  // --- Grace countdown during provisional_closed ----------------------------
  useEffect(() => {
    if (reviewState !== "provisional_closed" || !graceUntil) {
      setRemainingMs(null);
      return;
    }
    const target = new Date(graceUntil).getTime();
    const tick = () => setRemainingMs(Math.max(0, target - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [reviewState, graceUntil]);

  const pingActivity = () => {
    const now = Date.now();
    if (now - lastPingRef.current < ACTIVITY_THROTTLE_MS) return;
    lastPingRef.current = now;
    peerreviewActivity(arg.argumentUri).then((r) => {
      if (!r) return;
      setReviewState(r.state);
      setGraceUntil(r.graceUntil);
    });
  };

  const shownCriteria = criteriaTemplate.filter((c) => c.key !== NON_DUP_KEY || dup);
  const nonDupLabel = criteriaTemplate.find((c) => c.key === NON_DUP_KEY)?.label ?? "";

  // Kopplung Kriterien → Entscheidung: aus den Antworten eine weiche Empfehlung
  // ableiten. Das Gesamturteil ist erst wählbar, wenn ALLE Kriterien beurteilt sind.
  const flaggedCount = shownCriteria.filter((c) => assessments[c.key] === "flagged").length;
  const allAssessed = shownCriteria.every(
    (c) => assessments[c.key] === "ok" || assessments[c.key] === "flagged",
  );

  const setAssessment = (key: string, value: CriterionAssessment | null) => {
    setAssessments((prev) => ({ ...prev, [key]: value }));
    if (key === NON_DUP_KEY && value === "flagged" && !voteTouched) {
      setVote("REJECT"); // bestätigtes Duplikat → „nein" vorwählen (überschreibbar)
    }
    pingActivity();
  };

  const chooseVote = (v: "APPROVE" | "REJECT") => {
    setVote(v);
    setVoteTouched(true);
    pingActivity();
  };

  const handleSubmit = async () => {
    if (!vote) return;
    // Nur bewusst gesetzte Kriterien mitschicken (nicht-gesetzte = kein Signal).
    const criteria: PeerreviewCriterionRating[] = shownCriteria
      .filter((c) => assessments[c.key] === "ok" || assessments[c.key] === "flagged")
      .map((c) => ({
        key: c.key,
        label: c.label,
        assessment: assessments[c.key] as CriterionAssessment,
      }));
    setSubmitting(true);
    setError("");
    try {
      await submitPeerreview(arg.argumentUri, criteria, vote);
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      setDone(true);
      onSubmitted(arg.argumentUri);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <Alert>
        <AlertDescription>{t("submitSuccess")}</AlertDescription>
      </Alert>
    );
  }

  if (gate === "checking") {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (gate === "closed" || gate === "too_late") {
    return (
      <Alert>
        <AlertDescription>
          {gate === "closed" ? t("reviewClosed") : t("reviewTooLate")}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
    <div className="space-y-5">
      {/* Aufforderung / Kurzanleitung */}
      <div className="rounded-md bg-[#fbeede] border border-amber-200/70 px-4 py-3">
        <h3 className="text-sm font-semibold m-0 mb-1">{t("formHeading")}</h3>
        <p className="text-xs text-muted-foreground m-0 leading-relaxed">{t("formIntro")}</p>
      </div>

      {/* Grace-Countdown */}
      {remainingMs !== null && (
        <div className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          {t("graceCountdown", { time: formatMmss(remainingMs) })}
        </div>
      )}

      {/* Das begutachtete Argument — das Wichtigste: prominent, mit Overline-Label
          und mehr Abstand, damit klar ist, was bewertet wird. */}
      <div
        className="rounded-lg bg-muted p-5 shadow-sm"
        style={{ borderLeft: `5px solid ${arg.type === "PRO" ? "var(--pro)" : "var(--contra)"}` }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("underReview")}
          </span>
          <ProContraBadge
            type={arg.type?.toLowerCase()}
            variant="soft"
            label={stanceArgLabel(arg.type)}
          />
        </div>
        <h3 className="m-0 mb-2 text-lg font-semibold leading-snug">{arg.title}</h3>
        <p className="m-0 text-sm leading-relaxed whitespace-pre-wrap">{arg.body}</p>
      </div>

      {/* Kriterien — kompakt: eine Zeile je Kriterium (Label + ⓘ-Tooltip links,
          ✓/✗-Toggle rechts). */}
      <div>
        <h4 className="text-base font-semibold m-0">{t("criteriaAssessment")}</h4>
        <p className="text-xs text-muted-foreground m-0 mt-0.5 mb-2">{t("criteriaHint")}</p>
        <div className="divide-y divide-border/60">
          {shownCriteria
            .filter((c) => c.key !== NON_DUP_KEY)
            .map((c) => {
              const desc = descFor(c.key);
              const short = shortFor(c.key);
              return (
                <div
                  key={c.key}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">{c.label}</span>
                      {desc && <CriterionInfo text={desc} />}
                    </div>
                    {short && (
                      <p className="m-0 mt-0.5 text-xs text-muted-foreground">{short}</p>
                    )}
                  </div>
                  <AssessmentToggle
                    value={assessments[c.key] ?? null}
                    onChange={(v) => setAssessment(c.key, v)}
                    okTitle={t("assessmentOk")}
                    flaggedTitle={t("assessmentFlagged")}
                  />
                </div>
              );
            })}

          {/* „Kein Duplikat" — nur bei Live-Treffer. Gleiche Zeilen-Optik wie die
              anderen Kriterien (keine eigene Card); der Duplikat-Volltext wird von
              Anfang an gezeigt. */}
          {dup && (
            <div className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium">{nonDupLabel}</span>
                </div>
                <p className="m-0 mt-0.5 text-xs text-muted-foreground">{t("duplicateHint")}</p>
                <div className="mt-2 rounded-md bg-muted/60 p-2.5">
                  <div className="mb-1 flex items-center gap-2">
                    <ProContraBadge
                      type={dup.type?.toLowerCase()}
                      variant="soft"
                      label={stanceArgLabel(dup.type)}
                    />
                    <span className="text-xs text-muted-foreground">
                      {t("duplicateSimilarity", { pct: Math.round(dup.similarity * 100) })}
                    </span>
                  </div>
                  <div className="text-sm font-medium">{dup.title}</div>
                  <p className="m-0 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                    {dup.body}
                  </p>
                </div>
                {assessments[NON_DUP_KEY] === "flagged" && (
                  <p className="m-0 mt-2 text-xs text-red-700">{t("duplicateRecommendNo")}</p>
                )}
              </div>
              <AssessmentToggle
                value={assessments[NON_DUP_KEY] ?? null}
                onChange={(v) => setAssessment(NON_DUP_KEY, v)}
                okTitle={t("duplicateNotDupe")}
                flaggedTitle={t("duplicateIsDupe")}
              />
            </div>
          )}
        </div>
      </div>

      {/* Gesamturteil ja/nein — die übergeordnete, massgebliche Entscheidung.
          Bewusst als hervorgehobene Karte abgesetzt von den (optionalen) Kriterien. */}
      <div className="rounded-lg border-2 border-primary/30 bg-muted/40 p-4">
        <h3 className="text-base font-semibold m-0">{t("admitQuestion")}</h3>
        <p className="text-xs text-muted-foreground m-0 mt-1">{t("admitSubtitle")}</p>
        {/* Gate + Kopplung Kriterien → Entscheidung: erst alle Kriterien beurteilen,
            danach eine antwortabhängige Empfehlung. */}
        {!allAssessed ? (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground">
            <Info className="size-3.5 shrink-0" />
            {t("assessAllFirst")}
          </div>
        ) : flaggedCount > 0 ? (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            <X className="size-3.5 shrink-0" />
            {t("recReject", { count: flaggedCount })}
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
            <Check className="size-3.5 shrink-0" />
            {t("recApprove")}
          </div>
        )}
        <div className="mt-3 flex gap-3">
          <Button
            type="button"
            disabled={!allAssessed}
            variant={vote === "APPROVE" ? "default" : "outline"}
            className={`flex-1 h-auto py-3 text-base ${vote === "APPROVE" ? "bg-green-600 hover:bg-green-700" : ""}`}
            onClick={() => chooseVote("APPROVE")}
          >
            {t("admitYes")}
          </Button>
          <Button
            type="button"
            disabled={!allAssessed}
            variant={vote === "REJECT" ? "default" : "outline"}
            className={`flex-1 h-auto py-3 text-base ${vote === "REJECT" ? "bg-red-600 hover:bg-red-700" : ""}`}
            onClick={() => chooseVote("REJECT")}
          >
            {t("admitNo")}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        className="w-full"
        onClick={handleSubmit}
        disabled={!vote || !allAssessed || submitting}
      >
        {submitting ? t("submitting") : t("submitReview")}
      </Button>
    </div>
    </TooltipProvider>
  );
}

function formatMmss(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ⓘ-Icon mit Tooltip: hält die (ausführliche) Erklärung eines Kriteriums, damit
// die Zeile selbst kompakt bleibt (nur Label + Icon).
function CriterionInfo({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={text}
          className="shrink-0 text-muted-foreground/70 hover:text-foreground focus-visible:outline-none"
        >
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px] text-left leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

// Icon-Toggle für ein Kriterium: ✓ (in Ordnung, grün) / ✗ (beanstandet, rot) —
// schneller scannbar als Text. Default nichts gewählt (value=null → beide
// dezent umrandet). Klick auf das aktive Icon deselektiert (→ null).
function AssessmentToggle({
  value,
  onChange,
  okTitle,
  flaggedTitle,
}: {
  value: CriterionAssessment | null;
  onChange: (v: CriterionAssessment | null) => void;
  okTitle: string;
  flaggedTitle: string;
}) {
  const base =
    "flex items-center justify-center px-2.5 py-1.5 transition-colors focus-visible:outline-none";
  return (
    <div className="inline-flex shrink-0 overflow-hidden rounded-md border">
      <button
        type="button"
        title={okTitle}
        aria-label={okTitle}
        aria-pressed={value === "ok"}
        onClick={() => onChange(value === "ok" ? null : "ok")}
        className={`${base} ${
          value === "ok"
            ? "bg-green-600 text-white"
            : "text-green-600 hover:bg-green-50"
        }`}
      >
        <Check className="size-4" />
      </button>
      <button
        type="button"
        title={flaggedTitle}
        aria-label={flaggedTitle}
        aria-pressed={value === "flagged"}
        onClick={() => onChange(value === "flagged" ? null : "flagged")}
        className={`${base} border-l ${
          value === "flagged"
            ? "bg-red-600 text-white"
            : "text-red-600 hover:bg-red-50"
        }`}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export default ReviewForm;
