"use client";

/**
 * Themen-Panorama — überlagerte farbige Bergketten, eine pro Thema.
 *
 * MODELL: Jedes bewertete Argument ist ein kleiner Berg an seiner Bewertungs-
 * position c ∈ [-1, 1] (aus `type` PRO/CONTRA und `viewerPreference` 0–100) mit
 * Default-Breite W und Default-Höhe H. Innerhalb eines Themas ADDIEREN sich die
 * überlappenden Mini-Berge zu einem Grat — die Höhe entsteht also aus der
 * Häufung, nicht aus einem gesetzten Wichtigkeitswert. Streuung ⇒ breite flache
 * Kette, Häufung ⇒ hoher Gipfel, Polarisierung ⇒ Doppelkette mit Tal (ganz ohne
 * Sonderfall).
 *
 * Farbe trägt das Thema (Legende), darum keine Labels/Leitlinien im Massiv mehr.
 * Die kurzen Striche auf der Achse sind die einzelnen Argumente — so sieht man,
 * woraus sich jede Kette zusammensetzt. Legenden-Hover hebt eine Kette hervor;
 * ein farbiger Punkt je Kette markiert optional den Mittelwert.
 *
 * Achs-Mapping: c = -1 → Nein, c = 0 → neutral, c = +1 → Ja.
 * Schwesteransicht zum Positionsband — dieselben Daten, andere Lesart.
 */
import { useMemo, useState } from "react";
import type { TaxonomyNode, TaxonomyArgument } from "@/types/ballots";
import { Card, CardContent } from "@/components/ui/card";

type T = (key: string) => string;

// Atmosphärische Tiefen-Rampe (kühles Blau-Slate): hinten hell/dunstig → vorne
// dunkel/satt. Erzeugt zusammen mit versetzten Grundlinien & Überlappung die
// Tiefenwirkung. Themen-Identität trägt das Label, nicht die Farbe.
type RGB = [number, number, number];
const BACK_RGB: RGB = [198, 210, 226]; // hinten (fern, dunstig)
const FRONT_RGB: RGB = [50, 63, 92]; // vorne (nah, dunkel)
const HAZE_RGB: RGB = [226, 232, 241]; // Dunst am Bergfuss

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (c1: RGB, c2: RGB, t: number): RGB => [
  Math.round(lerp(c1[0], c2[0], t)),
  Math.round(lerp(c1[1], c2[1], t)),
  Math.round(lerp(c1[2], c2[2], t)),
];
const rgbOf = ([r, g, b]: RGB, a = 1) =>
  a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
// depth ∈ [0..n-1]: 0 = hinten (hell), n-1 = vorne (dunkel).
const depthColor = (depth: number, n: number): RGB =>
  mix(BACK_RGB, FRONT_RGB, n <= 1 ? 1 : depth / (n - 1));

/* ---------- Geometrie / Skala (viewBox 0 0 680 300) ---------- */
const BASE_Y = 270;
const TOP_PAD = 78; // oberes Band für Labels + Leitlinien reserviert
const AVAIL = BASE_Y - TOP_PAD; // verfügbare Höhe für den höchsten Grat
const PX_MIN = 8;
const PX_MAX = 672;
// c ∈ [-1.1,1.1] → px (-1 → 60, 0 → 340, +1 → 620), geklemmt.
const xPx = (c: number) => Math.max(PX_MIN, Math.min(PX_MAX, 340 + c * 280));

// Defaults für W (Breite je Argument, in c-Einheiten) und H (Höhe je Argument,
// in px für einen isolierten Mini-Berg).
const DEFAULT_W = 0.16;
const DEFAULT_H = 22;
const DEFAULT_JITTER = 0.5; // Berglinien-Stärke (Anteil der lokalen Grathöhe)

const GRID = 160; // Stützpunkte je Kette (höher ⇒ schärfere Spitzen/Zacken)

// −/+ mit echtem Minuszeichen, z. B. „+46", „−28".
function signed(v: number): string {
  const n = Math.round(v * 100);
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return "0";
}

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

// fBm Value-Noise (mehrere Oktaven) über u ∈ [0,1], Werte ~[-1,1]. Deterministisch
// (Seed pro Thema), smoothstep-interpoliert → craggy „Berglinie", aber stetig.
function noiseFn(seed: number): (u: number) => number {
  const OCTAVES = 4;
  const BASE_FREQ = 6;
  const rand = mulberry32(seed);
  const layers: Array<{ freq: number; lattice: number[]; amp: number }> = [];
  let totalAmp = 0;
  for (let o = 0; o < OCTAVES; o++) {
    const freq = BASE_FREQ * 2 ** o; // 6, 12, 24, 48
    const lattice = new Array<number>(freq + 2);
    for (let i = 0; i < lattice.length; i++) lattice[i] = rand() * 2 - 1;
    // langsamer Abfall ⇒ mittlere/feine Frequenzen tragen mehr ⇒ kantiger.
    const amp = 0.72 ** o;
    layers.push({ freq, lattice, amp });
    totalAmp += amp;
  }
  // LINEARE Interpolation (kein smoothstep) ⇒ scharfe Knicke an den Gitterpunkten
  // statt weicher Wellen ⇒ kantige Berglinie.
  return (u: number) => {
    const uu = Math.max(0, Math.min(1, u));
    let s = 0;
    for (const { freq, lattice, amp } of layers) {
      const x = uu * freq;
      const i = Math.floor(x);
      const f = x - i;
      s += amp * (lattice[i] + f * (lattice[i + 1] - lattice[i]));
    }
    return s / totalAmp;
  };
}

/* ---------- Argument-Positionen eines Teilbaums (distinct) ---------- */
// c = (PRO ? +1 : -1) * (preference - 50) / 50 ∈ [-1,1]; neutral (50) = 0,
// zählt mit. Spiegelt die Backend-Aggregation (taxonomy.py).
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

type Chain = {
  node: TaxonomyNode;
  idx: number;
  contribs: number[];
  mean: number; // nur fürs Tooltip (⌀-Wert)
  d: string; // gefüllte Silhouette
  peakX: number;
  peakY: number; // höchster Gipfel der Kette — Anker für Label/Leitlinie
  lines: string[]; // umgebrochenes Label (max. 2 Zeilen)
  slotX: number; // x des Labels im oberen Band (gegen Überlappung verschoben)
  depth: number; // 0 = hinten (hell) … n-1 = vorne (dunkel)
  shift: number; // vertikaler Versatz der Grundlinie (px, hinten höher = ferner)
};

// Spitzer Mini-Berg-Kern: Peak 1 bei dist 0, linear auf 0 bei dist = W (Dreieck/
// Zelt). Spitzer als ein Kosinus-Bump ⇒ kantigere, weniger runde Gipfel.
const bump = (dist: number, w: number) => (dist >= w ? 0 : 1 - dist / w);

type Prepared = { node: TaxonomyNode; idx: number; contribs: number[] };

function buildChains(
  nodes: TaxonomyNode[],
  W: number,
  H: number,
  jitter: number,
  normalize: boolean,
  stacked: boolean,
): Chain[] {
  const prepared: Prepared[] = nodes
    .map((node, idx) => ({ node, idx, contribs: collectContribs(node) }))
    .filter((p) => p.contribs.length > 0);
  if (!prepared.length) return [];
  if (stacked) return buildStacked(prepared, W, H, jitter, normalize);

  // 1. Pass: je Thema die summierte Dichte über das eigene Trägerintervall
  //    sampeln. NORMALISIERT: durch die Argumentzahl teilen ⇒ jede Kette hat
  //    dieselbe Fläche (∫ = Fläche eines Einzel-Bumps), unabhängig davon, ob ein
  //    Thema mit 2 oder 50 Argumenten bewertet wurde. Häufung zeigt sich dann als
  //    Form (hoch/schmal vs. flach/breit), nicht als Gesamtfläche.
  const sampled = prepared.map(({ node, idx, contribs }) => {
    const norm = normalize ? 1 / contribs.length : 1;
    const lo = Math.max(-1.1, Math.min(...contribs) - W);
    const hi = Math.min(1.1, Math.max(...contribs) + W);
    const span = hi - lo || 0.001;
    const units: number[] = [];
    let localMax = 0;
    let peakI = 0;
    for (let i = 0; i <= GRID; i++) {
      const x = lo + (span * i) / GRID;
      let s = 0;
      for (const c of contribs) s += bump(Math.abs(x - c), W);
      s *= norm;
      units.push(s);
      if (s > localMax) {
        localMax = s;
        peakI = i;
      }
    }
    const mean = contribs.reduce((a, b) => a + b, 0) / contribs.length;
    const peakC = lo + (span * peakI) / GRID;
    return { node, idx, contribs, lo, hi, span, units, mean, localMax, peakC };
  });

  const globalMax = Math.max(...sampled.map((s) => s.localMax), 1e-6);
  // px-Faktor: H px je Einheit. Bei Überlauf herunterskalieren; im normalisierten
  // Modus zusätzlich hochskalieren, damit der höchste Grat den Rahmen füllt
  // (sonst würden flächengleiche, breite Themen unleserlich flach).
  let factor = H;
  const peak = globalMax * factor;
  const FILL = 0.9 * AVAIL;
  if (peak > AVAIL) factor *= AVAIL / peak;
  else if (normalize && peak < FILL) factor *= FILL / peak;

  // 2. Pass: Pfade + Gipfel-Anker. Seeded „Berglinie": Noise proportional zur
  //    lokalen Grathöhe ⇒ Zacken am Gipfel stark, am Fuss/im Tal exakt null.
  //    Anker = HÖCHSTER GEZEICHNETER Punkt (inkl. Jitter), damit der Ring exakt
  //    auf der sichtbaren Spitze sitzt und nicht unter der glatten Hüllkurve.
  const chains: Chain[] = sampled.map((s) => {
    const noise = noiseFn(hash(s.node.name));
    const pts: string[] = [`${xPx(s.lo).toFixed(1)},${BASE_Y}`];
    let topX = xPx(s.peakC);
    let topY = BASE_Y;
    for (let i = 0; i <= GRID; i++) {
      const x = s.lo + (s.span * i) / GRID;
      const drawn = s.units[i] * factor; // px-Höhe an dieser Stelle
      const j = noise(i / GRID) * drawn * jitter;
      const y = Math.min(BASE_Y, BASE_Y - drawn - j);
      if (y < topY) {
        topY = y;
        topX = xPx(x);
      }
      pts.push(`${xPx(x).toFixed(1)},${y.toFixed(1)}`);
    }
    pts.push(`${xPx(s.hi).toFixed(1)},${BASE_Y}`);
    return {
      node: s.node,
      idx: s.idx,
      contribs: s.contribs,
      mean: s.mean,
      d: "M" + pts.join(" L") + " Z",
      peakX: topX,
      peakY: topY,
      lines: wrapLabel(s.node.name),
      slotX: topX,
      depth: 0,
      shift: 0,
    };
  });

  assignDepth(chains);
  layoutLabels(chains);
  return chains;
}

// Gestapelter Modus: alle Ketten teilen ein gemeinsames Gitter und werden
// kumulativ aufeinandergesetzt — die Oberkante einer Kette ist der Boden der
// nächsten (lückenlos). Gesamthöhe = Summe aller Ketten ⇒ man liest die
// Komposition statt der Überlagerung.
function buildStacked(
  prepared: Prepared[],
  W: number,
  H: number,
  jitter: number,
  normalize: boolean,
): Chain[] {
  const allC = prepared.flatMap((p) => p.contribs);
  const lo = Math.max(-1.1, Math.min(...allC) - W);
  const hi = Math.min(1.1, Math.max(...allC) + W);
  const span = hi - lo || 0.001;
  const xs: number[] = [];
  for (let i = 0; i <= GRID; i++) xs.push(lo + (span * i) / GRID);

  // Dichte je Kette auf dem gemeinsamen Gitter (normalisiert = gleiche Fläche).
  const layers = prepared.map(({ node, idx, contribs }) => {
    const norm = normalize ? 1 / contribs.length : 1;
    const units = xs.map((x) => {
      let s = 0;
      for (const c of contribs) s += bump(Math.abs(x - c), W);
      return s * norm;
    });
    const mean = contribs.reduce((a, b) => a + b, 0) / contribs.length;
    return { node, idx, contribs, units, mean };
  });

  // Höchste Spaltensumme bestimmt die Skalierung (höchster Stapel füllt Rahmen).
  let colMax = 1e-6;
  for (let i = 0; i <= GRID; i++) {
    let sum = 0;
    for (const l of layers) sum += l.units[i];
    if (sum > colMax) colMax = sum;
  }
  const factor = Math.min(H * 4, (0.92 * AVAIL) / colMax);

  // kumulativ stapeln (untere Kette zuerst, deterministisch nach idx).
  const cum = new Array<number>(GRID + 1).fill(BASE_Y);
  const order = layers.slice().sort((a, b) => a.idx - b.idx);
  const chains: Chain[] = order.map((l, rank) => {
    const noise = noiseFn(hash(l.node.name));
    // Anker = wo die EIGENE Dichte des Themas maximal ist (nicht der kumulierte
    // Gipfel, der von den unteren Ketten abhängt).
    let peakIdx = 0;
    for (let i = 1; i <= GRID; i++)
      if (l.units[i] > l.units[peakIdx]) peakIdx = i;
    const top: number[] = [];
    for (let i = 0; i <= GRID; i++) {
      const drawn = l.units[i] * factor;
      // Jitter ∝ Dicke ⇒ Faktor (1 + jitter·noise) bleibt > 0; Band kippt nie.
      const thick = Math.max(0, drawn * (1 + jitter * noise(i / GRID)));
      top.push(cum[i] - thick);
    }
    const topX = xPx(xs[peakIdx]);
    const topY = top[peakIdx]; // auf der Bandoberkante beim Themen-Peak
    const pts: string[] = [];
    for (let i = 0; i <= GRID; i++)
      pts.push(`${xPx(xs[i]).toFixed(1)},${top[i].toFixed(1)}`);
    for (let i = GRID; i >= 0; i--)
      pts.push(`${xPx(xs[i]).toFixed(1)},${cum[i].toFixed(1)}`);
    for (let i = 0; i <= GRID; i++) cum[i] = top[i]; // Boden der nächsten Kette
    return {
      node: l.node,
      idx: l.idx,
      contribs: l.contribs,
      mean: l.mean,
      d: "M" + pts.join(" L") + " Z",
      peakX: topX,
      peakY: topY,
      lines: wrapLabel(l.node.name),
      slotX: topX,
      depth: rank, // unten = hinten/hell … oben = vorne/dunkel
      shift: 0, // im Stapel kein Grundlinien-Versatz
    };
  });

  layoutLabels(chains);
  return chains;
}

// Tiefen-Reihenfolge & versetzte Grundlinien (nur überlagerter Modus): kürzeste
// Kette nach hinten (depth 0, hell, Grundlinie am höchsten = ferner), höchste
// nach vorne (dunkel, Grundlinie unten). Erzeugt die gestaffelte Bergketten-Tiefe.
function assignDepth(chains: Chain[]) {
  const n = chains.length;
  const STEP = 10; // px Versatz je Tiefenstufe
  const byHeight = chains.slice().sort((a, b) => b.peakY - a.peakY); // niedrigste zuerst
  byHeight.forEach((c, rank) => {
    c.depth = rank;
    c.shift = (n - 1 - rank) * STEP; // hinten am höchsten angehoben
  });
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
  const full = name.replace(/\s+/g, " ").length;
  if (lines.join(" ").length < full && lines.length === MAX_LINES) {
    let last = lines[MAX_LINES - 1];
    if (last.length > MAX - 1) last = last.slice(0, MAX - 1);
    lines[MAX_LINES - 1] = last.replace(/\s+$/, "") + "…";
  } else if (lines.length && lines[lines.length - 1].length > MAX) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, MAX - 1) + "…";
  }
  return lines;
}

// Label-Slots im oberen Band: nahe am Gipfel-x, aber minimal auseinander-
// geschoben (1D-Non-Overlap), kreuzungsfrei.
function layoutLabels(chains: Chain[]) {
  const CHAR_W = 6.3;
  const SLOT_PAD = 12;
  const SLOT_MIN = 36;
  const SLOT_MAX = 644;
  const byX = chains.slice().sort((a, b) => a.peakX - b.peakX);
  const widths = byX.map(
    (c) => Math.max(...c.lines.map((l) => l.length)) * CHAR_W + SLOT_PAD,
  );
  const slots = byX.map((c) => c.peakX);
  for (let i = 1; i < slots.length; i++) {
    const minX = slots[i - 1] + (widths[i - 1] + widths[i]) / 2;
    if (slots[i] < minX) slots[i] = minX;
  }
  if (slots.length) {
    const last = slots.length - 1;
    if (slots[last] + widths[last] / 2 > SLOT_MAX)
      slots[last] = SLOT_MAX - widths[last] / 2;
    for (let i = last - 1; i >= 0; i--) {
      const maxX = slots[i + 1] - (widths[i + 1] + widths[i]) / 2;
      if (slots[i] > maxX) slots[i] = maxX;
    }
    if (slots[0] - widths[0] / 2 < SLOT_MIN) slots[0] = SLOT_MIN + widths[0] / 2;
  }
  byX.forEach((c, i) => {
    c.slotX = slots[i];
  });
}

// Label-Band-Geometrie (oben im viewBox).
const LABEL_TOP = 20; // Baseline erste Zeile
const LABEL_LINE_H = 13;
const labelBaseY = (lines: number) => LABEL_TOP + (lines - 1) * LABEL_LINE_H;

export function TopicPanorama({
  nodes,
  t,
  argWidth = DEFAULT_W,
  argHeight = DEFAULT_H,
  ridgeJitter = DEFAULT_JITTER,
  normalizeArea = true,
}: {
  nodes: TaxonomyNode[];
  t: T;
  argWidth?: number;
  argHeight?: number;
  /** Stärke der willkürlichen Berglinie als Anteil der lokalen Grathöhe (0 = glatt). */
  ridgeJitter?: number;
  /** true: jede Kette gleiche Fläche (Dichte); false: Höhe ∝ Argumentmenge. */
  normalizeArea?: boolean;
}) {
  const [stacked, setStacked] = useState(false);
  const chains = useMemo(
    () => buildChains(nodes, argWidth, argHeight, ridgeJitter, normalizeArea, stacked),
    [nodes, argWidth, argHeight, ridgeJitter, normalizeArea, stacked],
  );
  const [active, setActive] = useState<number | null>(null);

  if (!nodes.length) return null;

  const n = chains.length;
  // Zeichnen hinten → vorne (depth aufsteigend), damit nähere Berge die ferneren
  // überlappen. Gestapelt: depth = Stapelrang, also dieselbe Reihenfolge.
  const drawOrder = stacked
    ? chains
    : chains.slice().sort((a, b) => a.depth - b.depth);

  const dim = (idx: number) => active != null && active !== idx;
  const activeC = active != null ? chains.find((c) => c.idx === active) : null;
  const info = activeC
    ? `${activeC.node.name} · n=${activeC.contribs.length} · ⌀ ${signed(activeC.mean)}`
    : t("panoramaHint");

  return (
    <Card className="border-black/5 py-5">
      <CardContent className="px-4">
        <div className="mb-0.5 flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-foreground/90">
            {t("panoramaTitle")}
          </p>
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[12.5px] text-muted-foreground select-none">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 cursor-pointer accent-current"
              checked={stacked}
              onChange={(e) => setStacked(e.target.checked)}
            />
            {t("panoramaStack")}
          </label>
        </div>
        <p className="mb-3 text-[13px] leading-snug text-muted-foreground">
          {t("panoramaSubtitle")}
        </p>

        {chains.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">
            {t("unrated")}
          </p>
        ) : (
          <>
            <svg
              viewBox="0 0 680 300"
              role="img"
              className="block h-auto w-full"
              aria-label={t("panoramaTitle")}
            >
              <defs>
                {/* atmosphärischer Hintergrund-Dunst oben */}
                <linearGradient id="pano-bg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={rgbOf(HAZE_RGB, 0.45)} />
                  <stop offset="65%" stopColor={rgbOf(HAZE_RGB, 0)} />
                </linearGradient>
                {/* je Berg ein vertikaler Verlauf: Gipfel satt → Fuss dunstig */}
                {chains.map((c) => {
                  const top = depthColor(c.depth, n);
                  return (
                    <linearGradient
                      key={`g-${c.idx}`}
                      id={`pano-g-${c.idx}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor={rgbOf(top)} />
                      <stop offset="100%" stopColor={rgbOf(mix(top, HAZE_RGB, 0.5))} />
                    </linearGradient>
                  );
                })}
              </defs>
              <rect x={0} y={0} width={680} height={BASE_Y} fill="url(#pano-bg)" />

              {/* Bergketten, hinten → vorne; nähere überlappen die ferneren */}
              {drawOrder.map((c) => {
                const faded = dim(c.idx);
                return (
                  <path
                    key={c.idx}
                    d={c.d}
                    transform={c.shift ? `translate(0 ${-c.shift})` : undefined}
                    fill={`url(#pano-g-${c.idx})`}
                    stroke={rgbOf(mix(depthColor(c.depth, n), [16, 22, 36], 0.4))}
                    strokeOpacity={faded ? 0.25 : active === c.idx ? 1 : 0.7}
                    strokeWidth={active === c.idx ? 1.6 : 0.9}
                    strokeLinejoin="round"
                    opacity={faded ? 0.4 : 1}
                    style={{ cursor: "pointer", transition: "opacity .12s, stroke-opacity .12s" }}
                    onMouseEnter={() => setActive(c.idx)}
                    onMouseLeave={() => setActive(null)}
                  />
                );
              })}

              {/* Achse */}
              <line
                x1={20}
                y1={BASE_Y}
                x2={640}
                y2={BASE_Y}
                stroke="var(--border)"
                strokeWidth={0.5}
              />
              {/* einzelne Argumente als Striche auf der Achse */}
              {chains.map((c) =>
                c.contribs.map((v, i) => (
                  <line
                    key={`tk-${c.idx}-${i}`}
                    x1={xPx(v)}
                    y1={BASE_Y}
                    x2={xPx(v)}
                    y2={BASE_Y - 6}
                    stroke={rgbOf(depthColor(c.depth, n))}
                    strokeOpacity={dim(c.idx) ? 0.15 : 0.7}
                    strokeWidth={1}
                  />
                )),
              )}
              {/* neutrale Mitte */}
              <line
                x1={340}
                y1={BASE_Y - 8}
                x2={340}
                y2={BASE_Y + 8}
                stroke="var(--line-mid)"
                strokeWidth={0.5}
                strokeDasharray="3 3"
              />

              {/* Leitlinie vom höchsten Gipfel → Label-Slot oben (senkrecht hoch,
                  dann zum Slot) */}
              {chains.map((c) => {
                const yTop = labelBaseY(c.lines.length) + 4;
                const ringY = c.peakY - c.shift;
                return (
                  <polyline
                    key={`l-${c.idx}`}
                    points={`${c.peakX},${(ringY - 4).toFixed(1)} ${c.peakX},${(yTop + 6).toFixed(1)} ${c.slotX.toFixed(1)},${yTop.toFixed(1)}`}
                    fill="none"
                    stroke="var(--muted-foreground)"
                    strokeOpacity={dim(c.idx) ? 0.15 : active === c.idx ? 0.8 : 0.4}
                    strokeWidth={0.5}
                  />
                );
              })}

              {/* Ring am höchsten Gipfel = Anker (neutral, damit auch helle
                  Ketten sichtbar markiert sind) */}
              {chains.map((c) => (
                <circle
                  key={`pk-${c.idx}`}
                  cx={c.peakX}
                  cy={c.peakY - c.shift}
                  r={active === c.idx ? 4 : 3.5}
                  fill="var(--card)"
                  stroke={
                    active === c.idx ? "var(--foreground)" : "var(--muted-foreground)"
                  }
                  strokeOpacity={dim(c.idx) ? 0.3 : 1}
                  strokeWidth={1.6}
                />
              ))}

              {/* Themen-Labels im Band oben (max. 2 Zeilen, auseinandergeschoben) */}
              {chains.map((c) => (
                <text
                  key={`t-${c.idx}`}
                  x={c.slotX}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={active === c.idx ? 600 : 400}
                  fill={
                    dim(c.idx)
                      ? "var(--muted-foreground)"
                      : active === c.idx
                        ? "var(--foreground)"
                        : "var(--muted-foreground)"
                  }
                  opacity={dim(c.idx) ? 0.45 : 1}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setActive(c.idx)}
                  onMouseLeave={() => setActive(null)}
                >
                  {c.lines.map((ln, i) => (
                    <tspan key={i} x={c.slotX} y={LABEL_TOP + i * LABEL_LINE_H}>
                      {ln}
                    </tspan>
                  ))}
                </text>
              ))}

              {/* Pol-Beschriftung */}
              <text
                x={24}
                y={292}
                textAnchor="start"
                fontSize={12}
                fill="var(--muted-foreground)"
              >
                ← {t("panoramaNo")}
              </text>
              <text
                x={340}
                y={292}
                textAnchor="middle"
                fontSize={12}
                fill="var(--muted-foreground)"
              >
                {t("neutral")}
              </text>
              <text
                x={636}
                y={292}
                textAnchor="end"
                fontSize={12}
                fill="var(--muted-foreground)"
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
