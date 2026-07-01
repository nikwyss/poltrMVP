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
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/spinner";
import { ProContraBadge } from "@/components/pro-contra-badge";

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
  justification: string;
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
  const draftKey = DRAFT_PREFIX + arg.argumentUri;

  // Default: nichts vorgewählt (null). Der Gutachter setzt pro Kriterium bewusst
  // ein Signal (ok/beanstandet) — oder lässt es leer. Klick auf den aktiven
  // Zustand deselektiert wieder.
  const [assessments, setAssessments] = useState<Record<string, CriterionAssessment | null>>(() =>
    Object.fromEntries(criteriaTemplate.map((c) => [c.key, null]))
  );
  const [vote, setVote] = useState<"APPROVE" | "REJECT" | null>(null);
  const [voteTouched, setVoteTouched] = useState(false);
  const [justification, setJustification] = useState("");
  const [dup, setDup] = useState<DuplicateCandidate | null>(null);
  const [dupExpanded, setDupExpanded] = useState(false);
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
        if (d.justification) setJustification(d.justification);
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
      const d: DraftShape = { assessments, vote, justification };
      localStorage.setItem(draftKey, JSON.stringify(d));
    } catch {
      /* storage full / unavailable — non-critical */
    }
  }, [assessments, vote, justification, done, draftKey]);

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
    if (vote === "REJECT" && !justification.trim()) {
      setError(t("justificationRequired"));
      return;
    }
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
      await submitPeerreview(arg.argumentUri, criteria, vote, justification || undefined);
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

      {/* Argument-Vorschau */}
      <div
        className="p-4 bg-muted rounded-md"
        style={{ borderLeft: `4px solid ${arg.type === "PRO" ? "var(--pro)" : "var(--contra)"}` }}
      >
        <div className="flex items-center gap-2 mb-2">
          <ProContraBadge type={arg.type?.toLowerCase()} variant="soft" />
          <span className="text-xs text-muted-foreground">{t("ballot", { rkey: arg.ballotRkey })}</span>
        </div>
        <h3 className="m-0 mb-2 font-medium">{arg.title}</h3>
        <p className="m-0 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{arg.body}</p>
      </div>

      {/* Kriterien (optional: ok / beanstandet). Zweispaltig — links Toggle,
          rechts Erklärung. */}
      <div>
        <h4 className="text-sm font-medium mb-1">{t("criteriaAssessment")}</h4>
        <p className="text-xs text-muted-foreground m-0 mb-4">{t("criteriaHint")}</p>
        <div className="divide-y divide-border/60">
          {shownCriteria
            .filter((c) => c.key !== NON_DUP_KEY)
            .map((c) => {
              const desc = descFor(c.key);
              return (
                <div
                  key={c.key}
                  className="flex items-start justify-between gap-4 py-3 first:pt-0"
                >
                  {/* Titel + Erklärung als Einheit (die „Frage") */}
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{c.label}</div>
                    {desc && (
                      <p className="text-sm text-muted-foreground leading-relaxed m-0 mt-1">
                        {desc}
                      </p>
                    )}
                  </div>
                  {/* Toggle als „Antwort" rechts */}
                  <div className="shrink-0 pt-0.5">
                    <AssessmentToggle
                      value={assessments[c.key] ?? null}
                      onChange={(v) => setAssessment(c.key, v)}
                      okLabel={t("assessmentOk")}
                      flaggedLabel={t("assessmentFlagged")}
                    />
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Duplikat-Kriterium — nur bei Treffer */}
      {dup && (
        <div className="rounded-md border border-amber-300 bg-amber-50/60 p-3">
          <div className="text-sm font-medium mb-1">{t("duplicateTitle")}</div>
          <p className="text-xs text-muted-foreground mb-2">{t("duplicateHint")}</p>
          <div className="rounded bg-background/70 p-2 mb-3">
            <div className="flex items-center gap-2 mb-1">
              <ProContraBadge type={dup.type?.toLowerCase()} variant="soft" />
              <span className="text-xs text-muted-foreground">
                {t("duplicateSimilarity", { pct: Math.round(dup.similarity * 100) })}
              </span>
            </div>
            <div className="text-sm font-medium">{dup.title}</div>
            <p
              className={`m-0 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap ${
                dupExpanded ? "" : "line-clamp-3"
              }`}
            >
              {dup.body}
            </p>
            <button
              type="button"
              onClick={() => setDupExpanded((v) => !v)}
              className="mt-1 text-xs font-medium text-amber-700 hover:underline"
            >
              {dupExpanded ? t("dupShowLess") : t("dupShowMore")}
            </button>
          </div>
          <div className="text-sm font-medium mb-2">{t("duplicateDecisionLabel")}</div>
          <AssessmentToggle
            value={assessments[NON_DUP_KEY] ?? null}
            onChange={(v) => setAssessment(NON_DUP_KEY, v)}
            okLabel={t("duplicateNotDupe")}
            flaggedLabel={t("duplicateIsDupe")}
          />
          {assessments[NON_DUP_KEY] === "flagged" && (
            <p className="text-xs text-amber-700 mt-2">{t("duplicateRecommendNo")}</p>
          )}
        </div>
      )}

      {/* Gesamturteil ja/nein — die übergeordnete, massgebliche Entscheidung.
          Bewusst als hervorgehobene Karte abgesetzt von den (optionalen) Kriterien. */}
      <div className="rounded-lg border-2 border-primary/30 bg-muted/40 p-4">
        <h3 className="text-base font-semibold m-0">{t("admitQuestion")}</h3>
        <p className="text-xs text-muted-foreground m-0 mt-1 mb-3">{t("admitSubtitle")}</p>
        <div className="flex gap-3">
          <Button
            type="button"
            variant={vote === "APPROVE" ? "default" : "outline"}
            className={`flex-1 h-auto py-3 text-base ${vote === "APPROVE" ? "bg-green-600 hover:bg-green-700" : ""}`}
            onClick={() => chooseVote("APPROVE")}
          >
            {t("admitYes")}
          </Button>
          <Button
            type="button"
            variant={vote === "REJECT" ? "default" : "outline"}
            className={`flex-1 h-auto py-3 text-base ${vote === "REJECT" ? "bg-red-600 hover:bg-red-700" : ""}`}
            onClick={() => chooseVote("REJECT")}
          >
            {t("admitNo")}
          </Button>
        </div>
      </div>

      {/* Begründung — nur bei „nein" (Ablehnung) */}
      {vote === "REJECT" && (
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            {t("justificationRequiredLabel")}
          </label>
          <Textarea
            value={justification}
            onChange={(e) => {
              setJustification(e.target.value);
              pingActivity();
            }}
            placeholder={t("justificationPlaceholder")}
            rows={3}
          />
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button className="w-full" onClick={handleSubmit} disabled={!vote || submitting}>
        {submitting ? t("submitting") : t("submitReview")}
      </Button>
    </div>
  );
}

function formatMmss(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Kompakter Segmented-Toggle für ein Kriterium: ein kleiner Inline-Pill mit
// zwei Segmenten (ok = grün, beanstandet = bernstein). Default nichts gewählt
// (value=null → beide neutral). Klick auf das aktive Segment deselektiert (→ null).
function AssessmentToggle({
  value,
  onChange,
  okLabel,
  flaggedLabel,
}: {
  value: CriterionAssessment | null;
  onChange: (v: CriterionAssessment | null) => void;
  okLabel: string;
  flaggedLabel: string;
}) {
  const base =
    "px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none";
  return (
    <div className="inline-flex overflow-hidden rounded-md border">
      <button
        type="button"
        aria-pressed={value === "ok"}
        onClick={() => onChange(value === "ok" ? null : "ok")}
        className={`${base} ${
          value === "ok"
            ? "bg-green-600 text-white"
            : "text-muted-foreground hover:bg-muted"
        }`}
      >
        {okLabel}
      </button>
      <button
        type="button"
        aria-pressed={value === "flagged"}
        onClick={() => onChange(value === "flagged" ? null : "flagged")}
        className={`${base} border-l ${
          value === "flagged"
            ? "bg-amber-500 text-white"
            : "text-muted-foreground hover:bg-muted"
        }`}
      >
        {flaggedLabel}
      </button>
    </div>
  );
}

export default ReviewForm;
