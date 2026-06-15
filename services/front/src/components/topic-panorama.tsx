"use client";

/**
 * Themen-Panorama — Bergpanorama statt Balken. Jedes Top-Thema ist ein Berg auf
 * der Achse von Nein (links) nach Ja (rechts).
 *
 * Die Silhouette ist eine ECHTE Dichteschätzung (KDE) der Argument-Positionen
 * des Viewers: pro bewertetem Argument ergibt sich aus `type` (PRO/CONTRA) und
 * `viewerPreference` (0–100) eine Position c ∈ [-1, 1]; ein Gauss-Kernel darüber
 * formt den Berg. Wo viele Argumente nah beieinander liegen, wird der Grat hoch
 * und schmal; breite Streuung ⇒ breiter, flacher Berg; Polarisierung ⇒ zwei
 * Gipfel mit Sattel. Density-Diagramm im Berg-Look.
 *
 * FIX aus den Daten:
 *  - Form = Verteilung der Argument-Positionen (KDE).
 *  - Höhe = Anzahl bewerteter Argumente (`ratedCount`).
 *  - Ring = Mittelwert der Haltung (`proLeaning`), auf der Kurve sitzend.
 *
 * Nur die feine Grat-Textur ist willkürlich (seeded Fractal-Noise auf der
 * Dichte-Hüllkurve, Seed = Themenname) — SSR und Client rendern identisch.
 *
 * Schwesteransicht zum Positionsband — dieselben Daten, andere Lesart.
 */
import { useMemo, useState } from "react";
import type { TaxonomyNode, TaxonomyArgument } from "@/types/ballots";
import { Card, CardContent } from "@/components/ui/card";

type T = (key: string) => string;

// Volltöne für gipfel-/wertbezogene Akzente (analog Positionsband).
const BLUE_TEXT = "rgb(46, 92, 168)"; // Richtung Befürworter
const TERRA_TEXT = "rgb(166, 86, 56)"; // Richtung Gegner

// Bergkörper-Palette: hinten (wenig Bewertungen) hell → vorne (viele) satt.
const MOUNTAIN_COLORS: Array<[number, number, number]> = [
  [203, 211, 219],
  [182, 194, 206],
  [163, 178, 192],
  [143, 161, 177],
  [124, 144, 162],
];

/* ---------- Geometrie / Skala (viewBox 0 0 680 350) ---------- */
const BASE_Y = 310;
const PX_MIN = 8;
const PX_MAX = 672;
// c ∈ [-1,1] → -100..100 → px (-100 → 60, 0 → 340, +100 → 620), geklemmt.
const xPx = (c: number) =>
  Math.max(PX_MIN, Math.min(PX_MAX, 340 + c * 280));

const H_MIN = 70; // niedrigster Berg (wenigste Bewertungen)
const H_MAX = 220; // höchster Berg (meiste Bewertungen)

/* ---------- deterministischer Zufall (Seed pro Thema) ---------- */
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// fBm-artiges 1D-Noise per Midpoint-Displacement, Werte ~[-1,1]. Liefert eine
// Funktion f(0..1) (linear interpoliert), damit der Grat craggy statt glockig
// wird — aber deterministisch und stetig.
function noiseFn(seed: number): (u: number) => number {
  const rand = mulberry32(seed);
  const SIZE = 129; // 2^7 + 1
  const a = new Array<number>(SIZE).fill(0);
  let step = SIZE - 1;
  let rough = 1;
  while (step > 1) {
    const half = step / 2;
    for (let i = half; i < SIZE - 1; i += step) {
      a[i] = (a[i - half] + a[i + half]) / 2 + (rand() - 0.5) * rough;
    }
    step = half;
    rough *= 0.5;
  }
  let max = 0;
  for (const v of a) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < SIZE; i++) a[i] /= max;
  return (u: number) => {
    const t = Math.max(0, Math.min(1, u)) * (SIZE - 1);
    const i = Math.floor(t);
    const f = t - i;
    return i + 1 < SIZE ? a[i] + f * (a[i + 1] - a[i]) : a[i];
  };
}

// −/+ mit echtem Minuszeichen, z. B. „+46", „−28".
function signed(lean: number): string {
  const v = Math.round(lean * 100);
  if (v > 0) return `+${v}`;
  if (v < 0) return `−${Math.abs(v)}`;
  return "0";
}

// Themenname in max. 3 Zeilen umbrechen, Rest mit Ellipse.
function wrapLabel(name: string): string[] {
  const MAX = 16;
  const MAX_LINES = 3;
  const words = name.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? cur + " " + w : w;
    if (cand.length <= MAX || !cur) {
      cur = cand;
    } else {
      lines.push(cur);
      cur = w;
      if (lines.length === MAX_LINES) break;
    }
  }
  if (cur && lines.length < MAX_LINES) lines.push(cur);
  // Überlauf? letzte Zeile kürzen und Ellipse.
  const consumed = lines.join(" ").length;
  if (consumed < name.replace(/\s+/g, " ").length && lines.length === MAX_LINES) {
    let last = lines[MAX_LINES - 1];
    if (last.length > MAX - 1) last = last.slice(0, MAX - 1);
    lines[MAX_LINES - 1] = last.replace(/\s+$/, "") + "…";
  } else if (lines.length && lines[lines.length - 1].length > MAX) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, MAX - 1) + "…";
  }
  return lines;
}

/* ---------- Argument-Beiträge eines Teilbaums sammeln (distinct) ---------- */
// c = (PRO ? +1 : -1) * (preference - 50) / 50  ∈ [-1, 1]; neutral (50) = 0,
// zählt als bewertet. Spiegelt die Backend-Aggregation (taxonomy.py).
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

type Mountain = {
  node: TaxonomyNode;
  idx: number;
  lean: number; // proLeaning (-1..1)
  rated: number;
  height: number; // px
  ringX: number;
  ringY: number;
  d: string;
  fill: string;
  edge: string;
  alpha: number;
  // Label-Layout
  lines: string[];
  labelX: number;
  labelBottomY: number; // y der untersten Label-Zeile (Baseline)
  connectorY: number; // y, bis wohin die Leitlinie geht
};

const GRID = 96;

function buildMountains(nodes: TaxonomyNode[]): Mountain[] {
  const prepared = nodes
    .map((node, idx) => ({ node, idx, contribs: collectContribs(node) }))
    .filter((p) => p.contribs.length > 0);
  if (!prepared.length) return [];

  const counts = prepared.map((p) => p.contribs.length);
  const minC = Math.min(...counts);
  const maxC = Math.max(...counts);
  const heightOf = (n: number) => {
    if (maxC === minC) return (H_MIN + H_MAX) / 2;
    const t = (Math.sqrt(n) - Math.sqrt(minC)) / (Math.sqrt(maxC) - Math.sqrt(minC));
    return H_MIN + (H_MAX - H_MIN) * t;
  };

  const built: Mountain[] = prepared.map(({ node, idx, contribs }) => {
    const rated = contribs.length;
    const height = heightOf(rated);

    // KDE-Bandbreite (Silverman, gedeckelt). std über die Beiträge.
    const mean = contribs.reduce((s, v) => s + v, 0) / rated;
    // Mittelwert für den Ring: bevorzugt das Backend-Aggregat, sonst der
    // Beitrags-Mittelwert (z. B. wenn nur neutral bewertet ⇒ proLeaning null).
    const lean = node.proLeaning ?? mean; // -1..1
    const variance =
      contribs.reduce((s, v) => s + (v - mean) ** 2, 0) / rated;
    const std = Math.sqrt(variance);
    const h = Math.max(
      0.14,
      Math.min(0.5, 1.06 * std * Math.pow(rated, -0.2) || 0.18),
    );

    const dens = (x: number) => {
      let s = 0;
      for (const c of contribs) {
        const z = (x - c) / h;
        s += Math.exp(-0.5 * z * z);
      }
      return s;
    };

    // Domäne = Datenbereich ± 3 Bandbreiten, geklemmt.
    const lo = Math.max(-1.18, Math.min(...contribs) - 3 * h);
    const hi = Math.min(1.18, Math.max(...contribs) + 3 * h);
    const span = hi - lo || 0.001;

    // Dichte über das Gitter + Normierung auf Maximum.
    let maxD = 1e-9;
    const grid: number[] = [];
    for (let i = 0; i <= GRID; i++) {
      const x = lo + (span * i) / GRID;
      const d = dens(x);
      grid.push(d);
      if (d > maxD) maxD = d;
    }

    const noise = noiseFn(hash(node.name));
    const jitterAmp = height * 0.08;

    // Silhouette: Fuss links → Grat → Fuss rechts, am Boden geschlossen.
    const pts: string[] = [];
    const loPx = xPx(lo);
    const hiPx = xPx(hi);
    pts.push(`${loPx.toFixed(1)},${BASE_Y}`);
    for (let i = 0; i <= GRID; i++) {
      const u = i / GRID;
      const x = lo + span * u;
      const norm = grid[i] / maxD; // 0..1
      const jitter = noise(u) * jitterAmp * norm;
      const y = BASE_Y - norm * height - jitter;
      pts.push(`${xPx(x).toFixed(1)},${Math.min(BASE_Y, y).toFixed(1)}`);
    }
    pts.push(`${hiPx.toFixed(1)},${BASE_Y}`);
    const d = "M" + pts.join(" L") + " Z";

    // Ring = Mittelwert auf der (glatten) Hüllkurve.
    const ringX = xPx(lean);
    const ringNorm = dens(lean) / maxD;
    const ringY = BASE_Y - Math.max(0, Math.min(1, ringNorm)) * height;

    return {
      node,
      idx,
      lean,
      rated,
      height,
      ringX,
      ringY,
      d,
      fill: "",
      edge: "",
      alpha: 1,
      lines: wrapLabel(node.name),
      labelX: ringX,
      labelBottomY: 0,
      connectorY: 0,
    };
  });

  // Zeichenreihenfolge & Farbe/Transparenz: nach Höhe (niedrig = hinten = hell
  // = transparenter, hoch = vorne = satt = deckender).
  const order = built
    .slice()
    .sort((a, b) => a.height - b.height || a.idx - b.idx);
  order.forEach((o, r) => {
    const frac = r / Math.max(1, order.length - 1);
    const [cr, cg, cb] =
      MOUNTAIN_COLORS[
        Math.min(
          MOUNTAIN_COLORS.length - 1,
          Math.round(frac * (MOUNTAIN_COLORS.length - 1)),
        )
      ];
    o.alpha = 0.72 + 0.23 * frac; // hinten leicht transparent
    o.fill = `rgba(${cr}, ${cg}, ${cb}, ${o.alpha.toFixed(2)})`;
    // Deutliche Bergkante: dunklere Variante des Körpers.
    o.edge = `rgb(${Math.round(cr * 0.52)}, ${Math.round(cg * 0.52)}, ${Math.round(cb * 0.52)})`;
  });

  // ── Label-Layout: direkt über dem Gipfel, zweistufig versetzt gegen Kollisionen.
  const LINE_H = 13;
  const GAP = 9; // Abstand Ring → unterste Zeile
  const TIER_RAISE = 30;
  const CHAR_W = 6.7;
  const byX = built.slice().sort((a, b) => a.labelX - b.labelX);
  const lastRight = [-Infinity, -Infinity];
  for (const m of byX) {
    const w =
      Math.max(...m.lines.map((l) => l.length)) * CHAR_W + 8;
    const left = m.labelX - w / 2;
    const right = m.labelX + w / 2;
    let tier = 0;
    if (left <= lastRight[0] + 4) tier = left > lastRight[1] + 4 ? 1 : 0;
    lastRight[tier] = right;
    const raise = tier * TIER_RAISE;
    // unterste Zeile knapp über dem Ring (+ Tier-Versatz), nach oben gestapelt.
    let bottom = m.ringY - GAP - raise;
    const topLine = bottom - (m.lines.length - 1) * LINE_H;
    if (topLine < 12) bottom += 12 - topLine; // nicht oben rausragen
    m.labelBottomY = bottom;
    m.connectorY = bottom + 3;
  }

  return built;
}

export function TopicPanorama({ nodes, t }: { nodes: TaxonomyNode[]; t: T }) {
  const mountains = useMemo(() => buildMountains(nodes), [nodes]);
  const [active, setActive] = useState<number | null>(null);

  if (!nodes.length) return null;

  const drawOrder = mountains
    .slice()
    .sort((a, b) => a.height - b.height || a.idx - b.idx); // niedrig zuerst (hinten)

  const activeM = active != null ? mountains.find((m) => m.idx === active) : null;
  const info = activeM
    ? `${activeM.node.name} · ${
        activeM.lean >= 0 ? t("poleSupporters") : t("poleOpponents")
      } · ${signed(activeM.lean)} · n=${activeM.rated}${
        (activeM.node.dissent ?? 0) > 0.6 ? ` · ${t("split")}` : ""
      }`
    : t("panoramaHint");

  return (
    <Card className="border-black/5 py-5">
      <CardContent className="px-4">
        <p className="mb-0.5 text-sm font-medium text-foreground/90">
          {t("panoramaTitle")}
        </p>
        <p className="mb-3 text-[13px] leading-snug text-muted-foreground">
          {t("panoramaSubtitle")}
        </p>

        {mountains.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">
            {t("unrated")}
          </p>
        ) : (
          <>
            <svg
              viewBox="0 0 680 350"
              role="img"
              className="block h-auto w-full"
              aria-label={t("panoramaTitle")}
            >
              {/* Bergkörper (hinten → vorne) mit deutlicher Kante */}
              {drawOrder.map((m) => (
                <path
                  key={m.idx}
                  d={m.d}
                  fill={m.fill}
                  stroke={active === m.idx ? "var(--foreground)" : m.edge}
                  strokeOpacity={active === m.idx ? 0.85 : 0.9}
                  strokeWidth={active === m.idx ? 1.8 : 1}
                  strokeLinejoin="round"
                  style={{ cursor: "pointer", transition: "stroke-width .12s" }}
                  onMouseEnter={() => setActive(m.idx)}
                  onMouseLeave={() => setActive(null)}
                />
              ))}

              {/* kurze Leitlinie Gipfel → Label */}
              {mountains.map((m) => (
                <line
                  key={`l-${m.idx}`}
                  x1={m.ringX}
                  y1={m.ringY - 4}
                  x2={m.labelX}
                  y2={m.connectorY}
                  stroke="var(--muted-foreground)"
                  strokeOpacity={0.4}
                  strokeWidth={0.5}
                />
              ))}

              {/* Gipfel-Ringe = Mittelwert (eingefärbt nach Lager) */}
              {mountains.map((m) => (
                <circle
                  key={`c-${m.idx}`}
                  cx={m.ringX}
                  cy={m.ringY}
                  r={4}
                  fill="var(--card)"
                  stroke={m.lean >= 0 ? BLUE_TEXT : TERRA_TEXT}
                  strokeWidth={1.8}
                />
              ))}

              {/* Themen-Labels direkt über dem Berg (max. 3 Zeilen, versetzt) */}
              {mountains.map((m) => (
                <text
                  key={`t-${m.idx}`}
                  x={m.labelX}
                  textAnchor="middle"
                  fontSize={12.5}
                  fill={active === m.idx ? "var(--foreground)" : "var(--muted-foreground)"}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setActive(m.idx)}
                  onMouseLeave={() => setActive(null)}
                >
                  {m.lines.map((ln, i) => (
                    <tspan
                      key={i}
                      x={m.labelX}
                      y={m.labelBottomY - (m.lines.length - 1 - i) * 13}
                    >
                      {ln}
                    </tspan>
                  ))}
                </text>
              ))}

              {/* Achse + neutrale Mitte */}
              <line
                x1={20}
                y1={BASE_Y}
                x2={640}
                y2={BASE_Y}
                stroke="var(--border)"
                strokeWidth={0.5}
              />
              <line
                x1={340}
                y1={BASE_Y - 8}
                x2={340}
                y2={BASE_Y + 8}
                stroke="var(--line-mid)"
                strokeWidth={0.5}
                strokeDasharray="3 3"
              />
              <text x={24} y={332} textAnchor="start" fontSize={12} fill={TERRA_TEXT}>
                ← {t("panoramaNo")}
              </text>
              <text
                x={340}
                y={332}
                textAnchor="middle"
                fontSize={12}
                fill="var(--muted-foreground)"
              >
                {t("neutral")}
              </text>
              <text x={636} y={332} textAnchor="end" fontSize={12} fill={BLUE_TEXT}>
                {t("panoramaYes")} →
              </text>
            </svg>

            <p className="mt-2 min-h-5 text-[13px] tabular-nums text-muted-foreground">
              {info}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default TopicPanorama;
