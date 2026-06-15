"use client";

/**
 * Themen-Panorama — Bergpanorama statt Balken. Jedes Top-Thema ist ein Berg auf
 * der Achse von Nein (links) nach Ja (rechts).
 *
 * Die Silhouette ist eine ECHTE Dichteschätzung (KDE) der Argument-Positionen
 * des Viewers: pro bewertetem Argument ergibt sich aus `type` (PRO/CONTRA) und
 * `viewerPreference` (0–100) eine Position c ∈ [-1, 1]; ein Epanechnikov-Kern
 * (kompakter Träger ±h ⇒ begrenzter Fussabdruck, kein endloser Ausläufer) formt
 * den Berg. Wo viele Argumente nah beieinander liegen, wird der Grat hoch und
 * schmal; breite Streuung ⇒ breiter, flacher Berg; Polarisierung ⇒ zwei Gipfel
 * mit Sattel. Density-Diagramm im Berg-Look.
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
const xPx = (c: number) => Math.max(PX_MIN, Math.min(PX_MAX, 340 + c * 280));

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

// fBm Value-Noise (2–3 Oktaven) über u ∈ [0,1], Werte ~[-1,1]. Deterministisch
// (Seed pro Thema), smoothstep-interpoliert → craggy, aber stetig.
function noiseFn(seed: number): (u: number) => number {
  const OCTAVES = 10;
  const BASE_FREQ = 50;
  const rand = mulberry32(seed);
  const layers: Array<{ freq: number; lattice: number[]; amp: number }> = [];
  let totalAmp = 0;
  for (let o = 0; o < OCTAVES; o++) {
    const freq = BASE_FREQ * 2 ** o;
    const lattice = new Array<number>(freq + 2);
    for (let i = 0; i < lattice.length; i++) lattice[i] = rand() * 2 - 1;
    const amp = 0.5 ** o;
    layers.push({ freq, lattice, amp });
    totalAmp += amp;
  }
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (u: number) => {
    const uu = Math.max(0, Math.min(1, u));
    let s = 0;
    for (const { freq, lattice, amp } of layers) {
      const x = uu * freq;
      const i = Math.floor(x);
      const f = smooth(x - i);
      s += amp * (lattice[i] + f * (lattice[i + 1] - lattice[i]));
    }
    return s / totalAmp;
  };
}

// −/+ mit echtem Minuszeichen, z. B. „+46", „−28".
function signed(lean: number): string {
  const v = Math.round(lean * 100);
  if (v > 0) return `+${v}`;
  if (v < 0) return `−${Math.abs(v)}`;
  return "0";
}

// Themenname in max. 2 Zeilen umbrechen, Rest mit Ellipse.
function wrapLabel(name: string): string[] {
  const MAX = 15;
  const MAX_LINES = 2;
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
  if (
    consumed < name.replace(/\s+/g, " ").length &&
    lines.length === MAX_LINES
  ) {
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
  lean: number; // mean(c) ∈ [-1,1] — Zentroid der Argument-Positionen
  rated: number;
  height: number; // px
  ringX: number;
  ringY: number;
  d: string;
  fill: string;
  edge: string;
  alpha: number;
  // Label im oberen Band (Slot-x, gegen Überlappung auseinandergeschoben)
  lines: string[];
  slotX: number;
};

const GRID = 96;

function buildMountains(nodes: TaxonomyNode[]): Mountain[] {
  const prepared = nodes
    .map((node, idx) => ({ node, idx, contribs: collectContribs(node) }))
    .filter((p) => p.contribs.length > 0);
  if (!prepared.length) return [];

  // Höhe ∝ √(Anteil bewerteter Argumente am Spitzenreiter).
  const maxRated = Math.max(...prepared.map((p) => p.contribs.length));
  const heightOf = (n: number) =>
    H_MIN + (H_MAX - H_MIN) * Math.sqrt(n / maxRated);

  const built: Mountain[] = prepared.map(({ node, idx, contribs }) => {
    const rated = contribs.length;
    const height = heightOf(rated);

    // Mittelwert der Beiträge = Ring-Position (Zentroid der Verteilung). Sitzt
    // bei Polarisierung korrekt unten im Sattel („Durchschnitt im Niemandsland").
    const mean = contribs.reduce((s, v) => s + v, 0) / rated;
    const lean = mean; // -1..1

    // KDE-Bandbreite: an die Streuung gekoppelt, gedeckelt — sonst schmiert der
    // Kern bei wenigen Argumenten über die ganze Achse. robuste Streuung via IQR.
    const sorted = contribs.slice().sort((a, b) => a - b);
    const quant = (p: number) => {
      const i = (sorted.length - 1) * p;
      const lo = Math.floor(i);
      const r = i - lo;
      return sorted[lo + 1] !== undefined
        ? sorted[lo] + r * (sorted[lo + 1] - sorted[lo])
        : sorted[lo];
    };
    const iqr = quant(0.75) - quant(0.25);
    const variance = contribs.reduce((s, v) => s + (v - mean) ** 2, 0) / rated;
    const std = Math.sqrt(variance);
    const spread = Math.max(iqr / 1.34, std);
    const BW_MIN = 0.1;
    const BW_MAX = 0.42;
    const h = Math.max(
      BW_MIN,
      Math.min(BW_MAX, 0.9 * spread * Math.pow(rated, -0.2) || BW_MIN),
    );

    // Epanechnikov-Kern: K(u) = max(0, 1 - u²) — Träger exakt ±h ⇒ begrenzter
    // Fussabdruck, kein endloser Ausläufer.
    const dens = (x: number) => {
      let s = 0;
      for (const c of contribs) {
        const u = (x - c) / h;
        if (u > -1 && u < 1) s += 1 - u * u;
      }
      return s;
    };

    // Domäne = Datenbereich ± 1 Bandbreite (Epanechnikov-Träger), geklemmt.
    const lo = Math.max(-1.18, Math.min(...contribs) - h);
    const hi = Math.min(1.18, Math.max(...contribs) + h);
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
      slotX: ringX,
    };
  });

  // Zeichenreihenfolge & Farbe/Transparenz: dominantes (höchstes/grösstes) Thema
  // nach HINTEN und am transparentesten, damit es die anderen nicht zudeckt;
  // kleinere Themen kommen satt und deckend nach vorne. r=0 = hinten.
  const order = built
    .slice()
    .sort((a, b) => b.height - a.height || a.idx - b.idx);
  order.forEach((o, r) => {
    const frac = r / Math.max(1, order.length - 1); // 0 hinten → 1 vorne
    const [cr, cg, cb] =
      MOUNTAIN_COLORS[
        Math.min(
          MOUNTAIN_COLORS.length - 1,
          Math.round(frac * (MOUNTAIN_COLORS.length - 1)),
        )
      ];
    o.alpha = 0.5 + 0.42 * frac; // hinten deutlich transparent (0.5) → vorne 0.92
    o.fill = `rgba(${cr}, ${cg}, ${cb}, ${o.alpha.toFixed(2)})`;
    // Deutliche Bergkante: dunklere Variante des Körpers.
    o.edge = `rgb(${Math.round(cr * 0.52)}, ${Math.round(cg * 0.52)}, ${Math.round(cb * 0.52)})`;
  });

  // ── Label-Band oben: jedes Label nahe seinem Gipfel-x, aber minimal
  // auseinandergeschoben (1D-Non-Overlap), Leitlinie vom Ring nach oben. Keine
  // Labels mehr im Berg-Gewühl → übersichtlich, Linien kurz & kreuzungsfrei.
  const CHAR_W = 6.3;
  const SLOT_PAD = 10;
  const SLOT_MIN = 36;
  const SLOT_MAX = 644;
  const byX = built.slice().sort((a, b) => a.ringX - b.ringX);
  const widths = byX.map(
    (m) => Math.max(...m.lines.map((l) => l.length)) * CHAR_W + SLOT_PAD,
  );
  const slots = byX.map((m) => m.ringX);
  // links → rechts auseinanderdrücken
  for (let i = 1; i < slots.length; i++) {
    const minX = slots[i - 1] + (widths[i - 1] + widths[i]) / 2;
    if (slots[i] < minX) slots[i] = minX;
  }
  // rechten Rand einhalten, dann rechts → links zurückdrücken
  if (slots.length) {
    const last = slots.length - 1;
    if (slots[last] + widths[last] / 2 > SLOT_MAX)
      slots[last] = SLOT_MAX - widths[last] / 2;
    for (let i = last - 1; i >= 0; i--) {
      const maxX = slots[i + 1] - (widths[i + 1] + widths[i]) / 2;
      if (slots[i] > maxX) slots[i] = maxX;
    }
    // linken Rand einhalten
    if (slots[0] - widths[0] / 2 < SLOT_MIN)
      slots[0] = SLOT_MIN + widths[0] / 2;
  }
  byX.forEach((m, i) => {
    m.slotX = slots[i];
  });

  return built;
}

// Label-Band-Geometrie (oben im viewBox).
const LABEL_TOP = 26; // Baseline erste Zeile
const LABEL_LINE_H = 13;
const labelBaseY = (lines: number) => LABEL_TOP + (lines - 1) * LABEL_LINE_H;

export function TopicPanorama({ nodes, t }: { nodes: TaxonomyNode[]; t: T }) {
  const mountains = useMemo(() => buildMountains(nodes), [nodes]);
  const [active, setActive] = useState<number | null>(null);

  if (!nodes.length) return null;

  const drawOrder = mountains
    .slice()
    .sort((a, b) => b.height - a.height || a.idx - b.idx); // höchstes zuerst (hinten)

  const activeM =
    active != null ? mountains.find((m) => m.idx === active) : null;
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

              {/* Leitlinie Gipfel-Ring → Label-Slot oben (geknickt: senkrecht
                  hoch, dann zum Slot) — kurz & kreuzungsfrei */}
              {mountains.map((m) => {
                const yTop = labelBaseY(m.lines.length) + 4;
                return (
                  <polyline
                    key={`l-${m.idx}`}
                    points={`${m.ringX},${(m.ringY - 4).toFixed(1)} ${m.ringX},${(yTop + 6).toFixed(1)} ${m.slotX.toFixed(1)},${yTop.toFixed(1)}`}
                    fill="none"
                    stroke="var(--muted-foreground)"
                    strokeOpacity={active === m.idx ? 0.8 : 0.35}
                    strokeWidth={0.5}
                  />
                );
              })}

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

              {/* Themen-Labels im Band oben (max. 2 Zeilen, auseinandergeschoben) */}
              {mountains.map((m) => (
                <text
                  key={`t-${m.idx}`}
                  x={m.slotX}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={active === m.idx ? 600 : 400}
                  fill={
                    active === m.idx
                      ? "var(--foreground)"
                      : "var(--muted-foreground)"
                  }
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setActive(m.idx)}
                  onMouseLeave={() => setActive(null)}
                >
                  {m.lines.map((ln, i) => (
                    <tspan key={i} x={m.slotX} y={LABEL_TOP + i * LABEL_LINE_H}>
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
              <text
                x={24}
                y={332}
                textAnchor="start"
                fontSize={12}
                fill={TERRA_TEXT}
              >
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
              <text
                x={636}
                y={332}
                textAnchor="end"
                fontSize={12}
                fill={BLUE_TEXT}
              >
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
