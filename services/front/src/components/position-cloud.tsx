"use client";

/**
 * Positionswolken — divergierende Likert-Verteilung je Thema. Schwesteransicht
 * zum (archivierten) Positionsband: Jede Argument-Bewertung fällt in eine von
 * fünf Stufen (Nein · eher Nein · neutral · eher Ja · Ja). Die Stufen bilden
 * einen durchgehenden Pill-Balken auf einer dezenten Schiene, von der neutralen
 * Mitte aus ausgewogen — die neutrale Stufe sitzt mittig auf der Achse,
 * Ablehnung wächst nach links, Zustimmung nach rechts.
 *
 * Die Zeilen sind nach Mittelwert sortiert (Leaderboard). Das Badge rechts
 * zeigt den Mittelwert aller Bewertungen des Themas in Prozentpunkten.
 *
 * Skala für ALLE Themen identisch (sonst nicht vergleichbar): gleiche
 * Stufengrenzen, gleiche Mitte, gemeinsame Schiene. Farbskala rot (Nein) ↔
 * neutral ↔ blau (Ja), konsistent mit dem Meinungsrad.
 *
 * Achs-Mapping: c = (PRO ? +1 : −1) · (preference − 50) / 50 ∈ [−1, 1]
 * (−1 = Nein, 0 = neutral, +1 = Ja).
 */
import { useMemo } from "react";
import type { TaxonomyNode, TaxonomyArgument } from "@/types/ballots";
import { Card, CardContent } from "@/components/ui/card";

type T = (key: string) => string;

const SERIF = {
  fontFamily: 'var(--font-serif), Georgia, "Times New Roman", serif',
} as const;

// Fünf Likert-Stufen, von Ablehnung (links, rot) zu Zustimmung (rechts, blau).
const CATS = [
  { key: "no", label: "panoramaNo", color: "rgb(176, 60, 42)" }, // Nein
  { key: "ratherNo", label: "cloudRatherNo", color: "rgb(214, 142, 120)" }, // eher Nein
  { key: "neutral", label: "neutral", color: "rgb(190, 181, 166)" }, // neutral
  { key: "ratherYes", label: "cloudRatherYes", color: "rgb(157, 181, 216)" }, // eher Ja
  { key: "yes", label: "panoramaYes", color: "rgb(60, 90, 143)" }, // Ja
] as const;

// Schiene (Track) — warmes Hellgrau, passend zur cremefarbenen Karte.
const TRACK = "rgb(238, 234, 226)";

// Net-Badge: blau getönt bei Zustimmung, rot bei Ablehnung.
const POS = { bg: "rgba(60, 90, 143, 0.12)", fg: "rgb(56, 84, 134)" };
const NEG = { bg: "rgba(176, 60, 42, 0.12)", fg: "rgb(166, 56, 38)" };
const ZERO = { bg: "rgba(0,0,0,0.05)", fg: "var(--muted-foreground)" };

/* ---------- Achsen-Geometrie (viewBox-Breite 600) ---------- */
const VW = 600;
const PAD = 10;
const X0 = PAD;
const X1 = VW - PAD;
const XC = (X0 + X1) / 2; // neutrale Mitte
const HALF = (X1 - X0) / 2; // entspricht Anteil 1.0 je Seite
const BARH = 30;
const TRACK_Y = 3;
const TRACK_H = 24;
const BAR_Y = 6;
const BAR_H = 18;

// c ∈ [−1,1] → Likert-Stufe 0…4 (gleich breite Fünftel).
function categorize(c: number): number {
  if (c < -0.6) return 0;
  if (c < -0.2) return 1;
  if (c <= 0.2) return 2;
  if (c <= 0.6) return 3;
  return 4;
}

// −/+ mit echtem Minuszeichen, z. B. „+46", „−28". v ∈ [−1,1] → Prozentpunkte.
function signed(v: number): string {
  const n = Math.round(v * 100);
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return "0";
}

/* ---------- distinct Bewertungen eines Teilbaums ---------- */
function collectContribs(node: TaxonomyNode): number[] {
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
  return [...seen.values()];
}

type Seg = { i: number; x: number; w: number };
type Row = {
  node: TaxonomyNode;
  n: number;
  mean: number;
  barLeft: number;
  segs: Seg[];
};

export function PositionCloud({ nodes, t }: { nodes: TaxonomyNode[]; t: T }) {
  const rows = useMemo<Row[]>(() => {
    const built = nodes.map((node) => {
      const cs = collectContribs(node);
      const n = cs.length;
      const counts = [0, 0, 0, 0, 0];
      for (const c of cs) counts[categorize(c)]++;
      const f = counts.map((k) => (n ? k / n : 0));
      // Kennzahl: Mittelwert aller Bewertungen (c ∈ [−1,1] → Prozentpunkte).
      const mean = n ? cs.reduce((a, b) => a + b, 0) / n : 0;
      // Divergierend: neutrale Stufe mittig auf der Achse, Rest links/rechts.
      // Durchgehender Balken (keine Lücken); Enden werden per Clip gerundet.
      const barLeft = XC - (f[0] + f[1] + f[2] / 2) * HALF;
      const segs: Seg[] = [];
      let acc = barLeft;
      for (let i = 0; i < 5; i++) {
        const w = f[i] * HALF;
        if (w > 0) segs.push({ i, x: acc, w });
        acc += w;
      }
      return { node, n, mean, barLeft, segs };
    });
    // Leaderboard: nach Mittelwert; unbewertete ans Ende.
    return built.sort((a, b) => {
      if (a.n === 0 || b.n === 0) return a.n === 0 ? (b.n === 0 ? 0 : 1) : -1;
      return b.mean - a.mean;
    });
  }, [nodes]);

  if (!nodes.length) return null;

  const rowGrid =
    "grid grid-cols-[minmax(150px,240px)_1fr_auto] items-center gap-4";

  return (
    <Card className="border-black/5 py-6">
      <CardContent className="px-6">
        {/* Eyebrow */}
        <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t("cloudEyebrow")} · {rows.length} {t("cloudThemes")}
        </p>
        {/* Serifen-Titel */}
        <p
          className="mb-1.5 text-[1.5rem] leading-tight tracking-tight text-foreground"
          style={SERIF}
        >
          {t("cloudTitle")}
        </p>
        <p className="mb-4 max-w-[62ch] text-[13.5px] leading-relaxed text-muted-foreground">
          {t("cloudSubtitle")}
        </p>

        {/* Legende der fünf Stufen */}
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted-foreground">
          {CATS.map((cat) => (
            <span key={cat.key} className="inline-flex items-center gap-1.5">
              <span
                className="h-3 w-3 rounded-[3px]"
                style={{ background: cat.color }}
              />
              {t(cat.label)}
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          {rows.map(({ node, n, mean, barLeft, segs }) => {
            const badge = n === 0 ? ZERO : mean > 0 ? POS : mean < 0 ? NEG : ZERO;
            const clipId = `cloud-clip-${node.id}`;
            return (
              <div key={node.id} className={rowGrid}>
                <span
                  className="text-right text-[15px] leading-snug text-foreground/85"
                  style={SERIF}
                  title={node.name}
                >
                  {node.name}
                </span>

                <svg
                  viewBox={`0 0 ${VW} ${BARH}`}
                  className="block h-auto w-full"
                  role="img"
                  aria-label={`${node.name} · n=${n} · ${signed(mean)}`}
                >
                  {/* Schiene */}
                  <rect
                    x={X0}
                    y={TRACK_Y}
                    width={X1 - X0}
                    height={TRACK_H}
                    rx={TRACK_H / 2}
                    fill={TRACK}
                  />
                  {n > 0 ? (
                    <>
                      {/* Gerundete Bar-Enden via Clip; Segmente stossen lückenlos. */}
                      <defs>
                        <clipPath id={clipId}>
                          <rect
                            x={barLeft}
                            y={BAR_Y}
                            width={HALF}
                            height={BAR_H}
                            rx={BAR_H / 2}
                          />
                        </clipPath>
                      </defs>
                      <g clipPath={`url(#${clipId})`}>
                        {segs.map((s) => (
                          <rect
                            key={s.i}
                            x={s.x}
                            y={BAR_Y}
                            width={s.w + 0.5}
                            height={BAR_H}
                            fill={CATS[s.i].color}
                          >
                            <title>{t(CATS[s.i].label)}</title>
                          </rect>
                        ))}
                      </g>
                    </>
                  ) : (
                    <circle cx={XC} cy={BARH / 2} r={3.5} fill="var(--line-mid)" />
                  )}
                  {/* neutrale Mitte — dezent über allem */}
                  <line
                    x1={XC}
                    y1={1}
                    x2={XC}
                    y2={BARH - 1}
                    stroke="var(--line-mid)"
                    strokeWidth={0.8}
                    strokeOpacity={0.45}
                    strokeDasharray="3 3"
                  />
                </svg>

                <span
                  className="justify-self-end rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums"
                  style={{ background: badge.bg, color: badge.fg }}
                  title={n === 0 ? t("unrated") : undefined}
                >
                  {n === 0 ? "—" : signed(mean)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Pol-Beschriftung: mehr Nein ← neutral → mehr Ja */}
        <div className={`${rowGrid} mt-3`}>
          <span />
          <div className="flex justify-between text-[11px] font-semibold uppercase tracking-[0.1em]">
            <span style={{ color: NEG.fg }}>{t("cloudMoreNo")}</span>
            <span className="text-muted-foreground">{t("neutral")}</span>
            <span style={{ color: POS.fg }}>{t("cloudMoreYes")}</span>
          </div>
          <span />
        </div>
      </CardContent>
    </Card>
  );
}

export default PositionCloud;
