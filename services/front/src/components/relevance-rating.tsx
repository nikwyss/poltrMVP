"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Minus, Plus } from "lucide-react";
import { Slider } from "@/components/ui/slider";

// Relevanz-Stufen auf der 1–100-Skala: gering / mittel / gross.
// (Schwellen so gewählt, dass z. B. 64 bereits als "gross" zählt.)
export function relevanceLevel(value: number): "low" | "medium" | "high" {
  if (value <= 30) return "low";
  if (value <= 60) return "medium";
  return "high";
}

const clamp = (v: number) => Math.min(100, Math.max(1, Math.round(v)));

/**
 * Bewertungs-Regler: Argument auf einer Skala von 1–100 nach Relevanz bewerten.
 * Über dem Regler schwebt eine Pille mit der qualitativen Stufe und dem Wert.
 *
 * `onChange` aktualisiert laufend (smooth UI), `onCommit` feuert beim Loslassen
 * bzw. bei den +/–-Buttons — dort wird die Bewertung persistiert.
 */
export function RelevanceRating({
  value,
  onChange,
  onCommit,
  showIntro = true,
  accent = "pro",
}: {
  value: number | null;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  showIntro?: boolean;
  // Farbkonzept: Füllung + Daumen in der Argumentfarbe (Pro = grün, Contra = rot).
  accent?: "pro" | "contra";
}) {
  const t = useTranslations("relevance");
  const rated = value !== null;
  // Unbewertet: Regler steht neutral in der Mitte, ohne Wert anzuzeigen.
  const display = value ?? 50;
  const level = relevanceLevel(display);
  const label = !rated
    ? t("notRated")
    : level === "low"
      ? t("low")
      : level === "medium"
        ? t("medium")
        : t("high");
  // Horizontale Position der Pille = Position des Reglerknopfes (1 → 0 %, 100 → 100 %).
  const pct = ((display - 1) / 99) * 100;

  // Farbkonzept = Argumentfarbe. Per Inline-Style gesetzt (statt gescopter Klasse),
  // damit die Custom Properties zuverlässig in den Radix-Slider hineinvererben.
  const accentStyle = {
    "--rng-accent": accent === "contra" ? "var(--red)" : "var(--green)",
    "--rng-deep": accent === "contra" ? "#8e2a1e" : "#1f5c40",
  } as CSSProperties;

  return (
    <div className="na-rating" style={accentStyle}>
      {showIntro && <p className="na-rating-intro">{t("intro")}</p>}

      <div className="na-rating-control">
        <button
          type="button"
          className="na-rating-step"
          aria-label={t("decrease")}
          onClick={() => {
            const next = clamp(display - 1);
            onChange(next);
            onCommit?.(next);
          }}
        >
          <Minus size={16} strokeWidth={2.5} />
        </button>

        <div className="na-rating-track-wrap">
          <div
            className={`na-rating-pill${rated ? "" : " na-rating-pill-unrated"}`}
            style={{ left: `${pct}%` }}
            aria-hidden="true"
          >
            <span className="na-rating-label">{label}</span>
            {rated && (
              <>
                <span className="na-rating-sep">|</span>
                <span className="na-rating-value">{display}</span>
              </>
            )}
          </div>
          <Slider
            className={`na-rating-slider${rated ? "" : " na-rating-slider-unrated"}`}
            min={1}
            max={100}
            step={1}
            value={[display]}
            onValueChange={(v) => onChange(clamp(v[0]))}
            onValueCommit={(v) => onCommit?.(clamp(v[0]))}
            aria-label={t("ariaLabel")}
          />
        </div>

        <button
          type="button"
          className="na-rating-step"
          aria-label={t("increase")}
          onClick={() => {
            const next = clamp(display + 1);
            onChange(next);
            onCommit?.(next);
          }}
        >
          <Plus size={16} strokeWidth={2.5} />
        </button>
      </div>

      <style jsx>{`
        .na-rating {
          width: 100%;
        }
        .na-rating-intro {
          margin: 0 0 14px;
          font-size: 0.875rem;
          line-height: 1.5;
          color: var(--text-mid, #555);
        }
        .na-rating-control {
          display: flex;
          align-items: center;
          gap: 14px;
          /* Platz für die über dem Regler schwebende Pille */
          margin-top: 40px;
          /* Breite begrenzen statt volle Seitenbreite, zentriert */
          max-width: 440px;
          margin-left: auto;
          margin-right: auto;
        }
        .na-rating-step {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: transparent;
          border: 1px solid var(--line, #e0ded9);
          color: var(--text-mid, #555);
          cursor: pointer;
          transition:
            background 0.15s ease,
            border-color 0.15s ease,
            color 0.15s ease;
        }
        .na-rating-step:hover {
          background: #fff;
          border-color: var(--line-mid, #c9c6bf);
          color: var(--text, #1a1814);
        }
        .na-rating-track-wrap {
          position: relative;
          flex: 1;
        }
        .na-rating-pill {
          position: absolute;
          bottom: calc(100% + 12px);
          transform: translateX(-50%);
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 5px 13px;
          border-radius: var(--r-full, 999px);
          background: var(--rng-deep);
          color: #fff;
          font-size: 0.8125rem;
          font-weight: 600;
          white-space: nowrap;
          box-shadow: 0 2px 8px rgba(58, 45, 30, 0.22);
          pointer-events: none;
        }
        /* kleiner Zeiger unter der Pille zum Reglerknopf */
        .na-rating-pill::after {
          content: "";
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border: 5px solid transparent;
          border-top-color: var(--rng-deep);
        }
        /* Noch nicht bewertet: zurückgenommene, helle Pille statt voller Akzent */
        .na-rating-pill-unrated {
          background: var(--surface-up, #ece9e3);
          color: var(--text-mid, #555);
          font-weight: 500;
          box-shadow: none;
        }
        .na-rating-pill-unrated::after {
          border-top-color: var(--surface-up, #ece9e3);
        }
        .na-rating-sep {
          opacity: 0.4;
          font-weight: 400;
        }
        .na-rating-value {
          font-variant-numeric: tabular-nums;
        }

        /* Slider-Optik an das Dossier angleichen: heller Track, dunkle Füllung */
        :global(.na-rating-slider [data-slot="slider-track"]) {
          background: var(--surface-up, #ece9e3);
          height: 8px;
          border-radius: 8px;
        }
        :global(.na-rating-slider [data-slot="slider-range"]) {
          background: var(--rng-accent);
        }
        :global(.na-rating-slider [data-slot="slider-thumb"]) {
          width: 18px;
          height: 18px;
          border-color: var(--rng-accent);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
          cursor: grab;
        }
        :global(.na-rating-slider [data-slot="slider-thumb"]:active) {
          cursor: grabbing;
        }
        /* Noch nicht bewertet: Füllung gedämpft, Knopf neutral — wirkt „leer“ */
        :global(.na-rating-slider-unrated [data-slot="slider-range"]) {
          background: var(--line-mid, #c9c6bf);
        }
        :global(.na-rating-slider-unrated [data-slot="slider-thumb"]) {
          border-color: var(--line-mid, #c9c6bf);
        }
      `}</style>
    </div>
  );
}
