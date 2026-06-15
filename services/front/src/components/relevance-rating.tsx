"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Minus, Plus } from "lucide-react";
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
  // Unbewertet: Regler steht links (0), ohne Wert anzuzeigen.
  const display = value ?? 0;
  const level = relevanceLevel(display);
  const LEVEL_KEYS = ["s0", "s1", "s2", "s3", "s4"] as const;
  const label = !rated ? t("notRated") : t(LEVEL_KEYS[level]);
  // Richtung aus dem Argument-Typ: Pro spricht „für ein Ja", Contra „für ein Nein".
  const direction = accent === "contra" ? t("dirNo") : t("dirYes");
  // Horizontale Position der Pille = Position des Reglerknopfes (0 → 0 %, 100 → 100 %).
  const pct = display;
  // Pille an den Rändern leicht einrücken, damit sie nicht über den Track
  // hinausragt (Default unbewertet sitzt bei 0 = ganz links).
  const pillPct = Math.min(92, Math.max(8, pct));

  // Farbkonzept = Argumentfarbe. Per Inline-Style gesetzt (statt gescopter Klasse),
  // damit die Custom Properties zuverlässig in den Radix-Slider hineinvererben.
  const accentStyle = {
    "--rng-accent": accent === "contra" ? "var(--contra)" : "var(--pro)",
    "--rng-deep": accent === "contra" ? "#76301f" : "#2c5a41",
  } as CSSProperties;

  return (
    <div className="na-rating" style={accentStyle}>
      {showIntro && <p className="na-rating-intro">{t("intro", { direction })}</p>}

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
            style={{ left: `${pillPct}%` }}
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
            min={0}
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
