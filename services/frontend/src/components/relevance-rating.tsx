"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Slider } from "@/components/ui/slider";

// Stärke-Stufen auf der unipolaren 0–100-Skala: 0..4 bei Schwellen 20/40/60/80.
// (0 = „spricht gar nicht dafür", 100 = „spricht sehr stark dafür".)
export function relevanceLevel(value: number): 0 | 1 | 2 | 3 | 4 {
  if (value < 20) return 0;
  if (value < 40) return 1;
  if (value < 60) return 2;
  if (value < 80) return 3;
  return 4;
}

const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v)));

/**
 * Bewertungs-Regler (unipolar): „Wie stark spricht dieses Argument für ein Ja
 * [bzw. Nein] zur Vorlage?" auf einer Skala 0–100. Die Richtung (Ja/Nein) kommt
 * aus dem Argument-Typ (`accent`); der Regler misst nur die Stärke.
 *
 * Layout: Kopfzeile mit Frage (links) + Status (rechts), darunter — solange
 * unbewertet — ein Hinweis zum Ziehen. Der Regler trägt Schwach→Stark-Endlabels.
 * Unbewertet sitzt der Knopf neutral in der Mitte und pulsiert sanft im Akzent,
 * um zur Bewertung aufzufordern; sobald gezogen wird, beruhigt sich alles.
 *
 * `onChange` aktualisiert laufend (smooth UI), `onCommit` feuert beim Loslassen —
 * dort wird die Bewertung persistiert.
 */
export function RelevanceRating({
  value,
  onChange,
  onCommit,
  accent = "pro",
}: {
  value: number | null;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  // Farbkonzept: Füllung + Daumen in der Argumentfarbe (Pro = grün, Contra = rot).
  accent?: "pro" | "contra";
}) {
  const t = useTranslations("relevance");
  const rated = value !== null;
  // Unbewertet: Knopf neutral in der Mitte (lädt ein, in beide Richtungen zu
  // ziehen) — ohne dass damit schon ein Wert gesetzt wäre.
  const display = value ?? 50;
  const level = relevanceLevel(display);
  const LEVEL_KEYS = ["s0", "s1", "s2", "s3", "s4"] as const;
  // Richtung aus dem Argument-Typ: Pro spricht „für ein Ja", Contra „für ein Nein".
  const direction = accent === "contra" ? t("dirNo") : t("dirYes");

  // Farbkonzept = Argumentfarbe. Per Inline-Style gesetzt (statt gescopter Klasse),
  // damit die Custom Properties zuverlässig in den Radix-Slider hineinvererben.
  const accentStyle = {
    "--rng-accent": accent === "contra" ? "var(--contra)" : "var(--pro)",
  } as CSSProperties;

  return (
    <div className="na-rating" style={accentStyle}>
      <div className="na-rating-head">
        <span className="na-rating-q">{t("question", { direction })}</span>
        <span className={`na-rating-status${rated ? " is-rated" : ""}`}>
          {rated ? (
            <>
              {t(LEVEL_KEYS[level])}
              <span className="na-rating-sep"> · </span>
              <span className="na-rating-value">{display}</span>
            </>
          ) : (
            t("notRated")
          )}
        </span>
      </div>

      {!rated && <p className="na-rating-prompt">{t("dragHint")}</p>}

      <div className="na-rating-track-wrap">
        <Slider
          className={`na-rating-slider${rated ? "" : " na-rating-slider-unrated"}`}
          min={0}
          max={100}
          step={1}
          value={[display]}
          onValueChange={(v) => onChange(clamp(v[0]))}
          onValueCommit={(v) => onCommit?.(clamp(v[0]))}
          aria-label={t("ariaLabel")}
        />
      </div>

      <div className="na-rating-ends">
        <span>{t("weak")}</span>
        <span>{t("strong")}</span>
      </div>

      <style jsx>{`
        .na-rating {
          width: 100%;
        }
        .na-rating-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
        }
        .na-rating-q {
          font-size: 0.9375rem;
          font-weight: 600;
          line-height: 1.35;
          color: var(--text, #1a1814);
        }
        .na-rating-status {
          flex-shrink: 0;
          font-size: 0.875rem;
          font-weight: 500;
          white-space: nowrap;
          color: var(--text-mid, #555);
        }
        .na-rating-status.is-rated {
          color: var(--rng-accent);
          font-weight: 700;
        }
        .na-rating-sep {
          opacity: 0.45;
        }
        .na-rating-value {
          font-variant-numeric: tabular-nums;
        }
        .na-rating-prompt {
          margin: 3px 0 0;
          font-size: 0.8125rem;
          line-height: 1.4;
          color: var(--text-mid, #555);
        }
        .na-rating-track-wrap {
          margin-top: 20px;
        }
        .na-rating-ends {
          display: flex;
          justify-content: space-between;
          margin-top: 9px;
          font-size: 0.75rem;
          color: var(--text-mid, #555);
        }

        /* Slider-Optik an das Dossier angleichen: heller Track, Akzentfüllung */
        :global(.na-rating-slider [data-slot="slider-track"]) {
          background: var(--surface-up, #ece9e3);
          height: 8px;
          border-radius: 8px;
        }
        :global(.na-rating-slider [data-slot="slider-range"]) {
          background: var(--rng-accent);
        }
        :global(.na-rating-slider [data-slot="slider-thumb"]) {
          width: 20px;
          height: 20px;
          border-color: var(--rng-accent);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
          cursor: grab;
        }
        :global(.na-rating-slider [data-slot="slider-thumb"]:active) {
          cursor: grabbing;
        }
        /* Noch nicht bewertet: Füllung neutral (kein impliziter Wert) und der
           Knopf pulsiert sanft im Akzent — lenkt den Blick auf den Regler.
           Sobald gezogen wird (value ≠ null), greift wieder der ruhige Stil. */
        :global(.na-rating-slider-unrated [data-slot="slider-range"]) {
          background: transparent;
        }
        :global(.na-rating-slider-unrated [data-slot="slider-thumb"]) {
          animation: na-thumb-pulse 1.8s ease-in-out infinite;
        }
        @keyframes na-thumb-pulse {
          0% {
            box-shadow: 0 0 0 0 color-mix(in srgb, var(--rng-accent) 50%, transparent);
          }
          70% {
            box-shadow: 0 0 0 9px color-mix(in srgb, var(--rng-accent) 0%, transparent);
          }
          100% {
            box-shadow: 0 0 0 0 transparent;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          :global(.na-rating-slider-unrated [data-slot="slider-thumb"]) {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
