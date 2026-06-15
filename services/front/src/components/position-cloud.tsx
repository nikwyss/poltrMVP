"use client";

/**
 * Positionswolken — Streifen-/Barcode-Plot je Thema. Schwesteransicht zum
 * Positionsband: Statt eines einzelnen Balkens (Aggregat) ist jedes bewertete
 * Argument ein kurzer Strich an seiner Position auf der Achse Nein ← neutral → Ja.
 *
 * Die Striche sind halbtransparent: wo sich Bewertungen häufen, überlagern sie
 * sich zu dichten, satten Bändern — so liest man Lage, Streuung und
 * Polarisierung direkt aus der Dichte, ganz ohne Aggregat.
 *
 * Farbe folgt der Position: terrakotta Richtung Nein, neutralgrau in der Mitte,
 * blau Richtung Ja (kontinuierlicher Verlauf, identische Farbsprache wie das
 * Positionsband).
 *
 * Achs-Mapping: c = (PRO ? +1 : −1) · (preference − 50) / 50 ∈ [−1, 1]
 * (−1 = Nein, 0 = neutral, +1 = Ja) — identisch zu Positionsband/Panorama.
 */
import { useMemo } from "react";
import type { TaxonomyNode, TaxonomyArgument } from "@/types/ballots";
import { Card, CardContent } from "@/components/ui/card";

type T = (key: string) => string;

const BLUE = { r: 74, g: 119, b: 190 }; // Richtung Befürworter (Ja)
const TERRA = { r: 178, g: 116, b: 92 }; // Richtung Gegner (Nein)
const NEUTRAL = { r: 172, g: 172, b: 172 }; // Mitte

/* ---------- Zeilen-Geometrie (viewBox 0 0 600 44 je Zeile) ---------- */
const VW = 600;
const PAD = 10;
const X0 = PAD; // c = -1
const X1 = VW - PAD; // c = +1
const xPx = (c: number) => X0 + ((c + 1) / 2) * (X1 - X0);

const ROWH = 44;
const TICK_TOP = 7;
const TICK_BOT = ROWH - 7;
const TICK_OPACITY = 0.28; // halbtransparent ⇒ Häufung verdichtet sich

// Alle Bewertungen werden auf eine gemeinsame 10er-Skala gerastet (Schrittweite
// 0.2 auf c ∈ [−1,1]) — statt der feinen 100er-Skala der Rohbewertung. Das gilt
// für ALLE Themen (sonst wären sie nicht vergleichbar): nahe Werte fallen auf
// dieselbe Stufe und bilden breite, lesbare Bänder. −1/0/+1 bleiben exakt.
const STEP = 0.2;
const snap = (c: number) => Math.round(c / STEP) * STEP;
// Strichbreite ≈ Stufenabstand, damit jede Stufe als sattes Band liest.
const TICK_W = ((X1 - X0) / 2) * STEP * 0.8;

// Position → Farbe: neutralgrau in der Mitte, zum jeweiligen Pol hin gesättigt.
function tickColor(c: number): string {
  const pole = c >= 0 ? BLUE : TERRA;
  const tt = Math.min(1, Math.abs(c));
  const r = Math.round(NEUTRAL.r + (pole.r - NEUTRAL.r) * tt);
  const g = Math.round(NEUTRAL.g + (pole.g - NEUTRAL.g) * tt);
  const b = Math.round(NEUTRAL.b + (pole.b - NEUTRAL.b) * tt);
  return `rgb(${r}, ${g}, ${b})`;
}

// −/+ mit echtem Minuszeichen, z. B. „+46", „−28".
function signed(v: number): string {
  const n = Math.round(v * 100);
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return "0";
}

/* ---------- distinct Bewertungen eines Teilbaums ---------- */
type Contrib = { c: number; uri: string };
function collectContribs(node: TaxonomyNode): Contrib[] {
  const seen = new Map<string, number>();
  const walk = (n: TaxonomyNode) => {
    for (const a of (n.arguments ?? []) as TaxonomyArgument[]) {
      if (a.viewerPreference == null || seen.has(a.uri)) continue;
      const sign = a.type === "PRO" ? 1 : -1;
      seen.set(a.uri, (sign * (a.viewerPreference - 50)) / 50);
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(node);
  return [...seen.entries()].map(([uri, c]) => ({ uri, c }));
}

export function PositionCloud({ nodes, t }: { nodes: TaxonomyNode[]; t: T }) {
  const rows = useMemo(
    () => nodes.map((n) => ({ node: n, contribs: collectContribs(n) })),
    [nodes],
  );

  if (!nodes.length) return null;

  const rowGrid = "grid grid-cols-[minmax(140px,230px)_1fr] items-center gap-3";

  return (
    <Card className="border-black/5 py-5">
      <CardContent className="px-4">
        <p className="mb-0.5 text-sm font-medium text-foreground/90">
          {t("cloudTitle")}
        </p>
        <p className="mb-4 text-[13px] leading-snug text-muted-foreground">
          {t("cloudSubtitle")}
        </p>

        {/* Pol-Beschriftung: Nein ← neutral → Ja */}
        <div className={rowGrid}>
          <span />
          <div className="flex justify-between text-xs font-medium text-muted-foreground">
            <span>← {t("panoramaNo")}</span>
            <span>{t("neutral")}</span>
            <span>{t("panoramaYes")} →</span>
          </div>
        </div>

        <div className="mt-2 flex flex-col gap-1">
          {rows.map(({ node, contribs }) => (
            <div key={node.id} className={rowGrid}>
              <span
                className="truncate text-left text-sm text-foreground/80"
                title={node.name}
              >
                {node.name}
              </span>

              {contribs.length === 0 ? (
                <div className="relative h-7">
                  <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 border-l border-dashed border-black/20" />
                  <span
                    className="absolute top-1/2 left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--line-mid)]"
                    title={t("unrated")}
                  />
                </div>
              ) : (
                <svg
                  viewBox={`0 0 ${VW} ${ROWH}`}
                  className="block h-auto w-full"
                  role="img"
                  aria-label={`${node.name} · n=${contribs.length}`}
                >
                  {/* Leitlinien: ±0.5 fein, neutrale Mitte stärker */}
                  {[-0.5, 0.5].map((g) => (
                    <line
                      key={g}
                      x1={xPx(g)}
                      y1={3}
                      x2={xPx(g)}
                      y2={ROWH - 3}
                      stroke="var(--border)"
                      strokeWidth={0.5}
                      strokeDasharray="2 4"
                    />
                  ))}
                  <line
                    x1={xPx(0)}
                    y1={2}
                    x2={xPx(0)}
                    y2={ROWH - 2}
                    stroke="var(--line-mid)"
                    strokeWidth={0.6}
                    strokeDasharray="3 3"
                  />

                  {/* ein Strich je bewertetem Argument, auf die 10er-Skala
                      gerastet; Überlagerung = Dichte. */}
                  {contribs.map((c) => {
                    const cx = xPx(snap(c.c));
                    return (
                      <line
                        key={c.uri}
                        x1={cx}
                        y1={TICK_TOP}
                        x2={cx}
                        y2={TICK_BOT}
                        stroke={tickColor(c.c)}
                        strokeWidth={TICK_W}
                        strokeOpacity={TICK_OPACITY}
                        strokeLinecap="butt"
                      >
                        <title>{signed(c.c)}</title>
                      </line>
                    );
                  })}
                </svg>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default PositionCloud;
