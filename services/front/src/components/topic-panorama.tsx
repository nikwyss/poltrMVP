"use client";

/**
 * Themen-Panorama — Bergpanorama statt Balken. Jedes Top-Thema ist ein Berg auf
 * der Achse von Nein (links) nach Ja (rechts).
 *
 * FIX (aus den Daten abgeleitet, nicht zufällig):
 *  - Gipfel-/Sattelposition (x) = Mittelpunkt der Haltung (`proLeaning`, -1 … +1).
 *  - Fundamentbreite (Streuung) = Dissens (`dissent`, 0 … 1).
 *  - Höhe = Wichtigkeit, hier proxyiert über die Argumentmenge (`argumentCount`).
 *
 * WILLKÜRLICH, aber deterministisch: die Gratlinie zwischen Fundament und Gipfel
 * wird per seeded Fractal-Midpoint-Displacement erzeugt (Seed = Themenname), damit
 * SSR und Client identisch rendern und die Linienführung „natürlich" wirkt.
 *
 * Schwesteransicht zum Positionsband — dieselben Daten, andere Lesart.
 */
import { useMemo, useState } from "react";
import type { TaxonomyNode } from "@/types/ballots";
import { Card, CardContent } from "@/components/ui/card";

type T = (key: string) => string;

const SPLIT_THRESHOLD = 0.6; // ab hier Doppelgipfel (polarisiert)

// Volltöne für gipfel-/wertbezogene Akzente (analog Positionsband).
const BLUE_TEXT = "rgb(46, 92, 168)"; // Richtung Befürworter
const TERRA_TEXT = "rgb(166, 86, 56)"; // Richtung Gegner

// Bergkörper-Palette: hinten (unwichtig) hell → vorne (wichtig) satt. Mitteltöne,
// die sowohl auf cremefarbenem als auch dunklem Grund lesbar sind.
const MOUNTAIN_COLORS = ["#CBD3DB", "#B6C2CE", "#A3B2C0", "#8FA1B1", "#7C90A2"];

/* ---------- Geometrie / Skala (viewBox 0 0 680 350) ---------- */
const BASE_Y = 310;
// -100 → 60, 0 → 340, +100 → 620
const xScale = (s: number) => 340 + (s / 100) * 280;

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

type Pt = { x: number; y: number };

/* ---------- prozedurale Gratlinie (Mittelpunkt-Verschiebung) ---------- */
function ridge(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rough: number,
  rand: () => number,
  depth: number,
  out: string[],
  minY: number,
  maxY: number,
) {
  if (depth <= 0) return;
  const mx = (ax + bx) / 2;
  let my = (ay + by) / 2 + (rand() - 0.5) * rough;
  my = Math.max(minY, Math.min(maxY, my));
  ridge(ax, ay, mx, my, rough * 0.5, rand, depth - 1, out, minY, maxY);
  out.push(mx.toFixed(1) + "," + my.toFixed(1));
  ridge(mx, my, bx, by, rough * 0.5, rand, depth - 1, out, minY, maxY);
}
function pathFor(controls: Pt[], seed: number, peakY: number): string {
  const rand = mulberry32(seed);
  const minY = peakY + 2;
  const maxY = BASE_Y;
  const pts: string[] = [controls[0].x.toFixed(1) + "," + controls[0].y.toFixed(1)];
  for (let i = 0; i < controls.length - 1; i++) {
    const A = controls[i];
    const B = controls[i + 1];
    const seg: string[] = [];
    const rough = Math.min(Math.abs(A.y - B.y), 70) * 0.45 + 12;
    ridge(A.x, A.y, B.x, B.y, rough, rand, 4, seg, minY, maxY);
    pts.push(...seg, B.x.toFixed(1) + "," + B.y.toFixed(1));
  }
  return "M" + pts.join(" L") + " Z";
}

// −/+ mit echtem Minuszeichen, z. B. „+46", „−28".
function signed(lean: number): string {
  const v = Math.round(lean * 100);
  if (v > 0) return `+${v}`;
  if (v < 0) return `−${Math.abs(v)}`;
  return "0";
}

type Mountain = {
  node: TaxonomyNode;
  idx: number;
  lean: number; // proLeaning (-1..1)
  split: boolean;
  peakY: number;
  ringX: number;
  ringY: number;
  d: string;
  color: string;
  labelX: number;
  label: string;
};

function buildMountains(nodes: TaxonomyNode[]): Mountain[] {
  const rated = nodes.filter((n) => n.proLeaning != null);
  if (!rated.length) return [];

  const counts = rated.map((n) => n.argumentCount ?? 0);
  const minC = Math.min(...counts);
  const maxC = Math.max(...counts);
  // Wichtigkeit 1..5 (für Höhe und Palette).
  const importanceOf = (n: TaxonomyNode) =>
    maxC === minC ? 3 : 1 + 4 * (((n.argumentCount ?? 0) - minC) / (maxC - minC));

  const built = rated.map((node, idx) => {
    const lean = node.proLeaning as number; // -1..1
    const meanScaled = lean * 100; // -100..100
    const dissent = node.dissent ?? 0;
    const split = dissent > SPLIT_THRESHOLD;
    const importance = importanceOf(node);

    const peakY = BASE_Y - (70 + importance * 22); // Höhe ∝ Wichtigkeit
    const sdpx = dissent * 280;
    const hw = Math.min(130, 24 + sdpx * 0.55); // halbe Fundamentbreite

    let controls: Pt[];
    let ringX: number;
    let ringY: number;

    if (split) {
      // Doppelgipfel: der Mittelwert sitzt im Sattel (polarisiert).
      const off = Math.min(45, dissent * 60);
      const ax = xScale(meanScaled - off);
      const bx = xScale(meanScaled + off);
      const sx = xScale(meanScaled);
      const sy = peakY + (BASE_Y - peakY) * 0.45;
      controls = [
        { x: Math.max(2, ax - hw), y: BASE_Y },
        { x: ax, y: peakY },
        { x: sx, y: sy },
        { x: bx, y: peakY },
        { x: Math.min(678, bx + hw), y: BASE_Y },
      ];
      ringX = sx;
      ringY = sy;
    } else {
      const px = xScale(meanScaled);
      controls = [
        { x: Math.max(2, px - hw), y: BASE_Y },
        { x: px, y: peakY },
        { x: Math.min(678, px + hw), y: BASE_Y },
      ];
      ringX = px;
      ringY = peakY;
    }

    return {
      node,
      idx,
      lean,
      split,
      peakY,
      ringX,
      ringY,
      d: pathFor(controls, hash(node.name), peakY),
      importance,
      color: "",
      labelX: 0,
      label: node.name.length > 22 ? node.name.slice(0, 21) + "…" : node.name,
    };
  });

  // Zeichenreihenfolge & Farbe: nach Wichtigkeit (hinten = unwichtiger = heller).
  const order = built
    .slice()
    .sort((a, b) => a.importance - b.importance || a.idx - b.idx);
  order.forEach((o, r) => {
    o.color =
      MOUNTAIN_COLORS[
        Math.min(
          MOUNTAIN_COLORS.length - 1,
          Math.round(
            (r / Math.max(1, order.length - 1)) * (MOUNTAIN_COLORS.length - 1),
          ),
        )
      ];
  });

  // Label-Slots gleichmässig, sortiert nach Gipfel-x (keine kreuzenden Linien).
  const byX = built.slice().sort((a, b) => a.ringX - b.ringX);
  const lx0 = 40;
  const lx1 = 540;
  const step = byX.length > 1 ? (lx1 - lx0) / (byX.length - 1) : 0;
  byX.forEach((o, i) => {
    o.labelX = lx0 + i * step;
  });

  return built;
}

export function TopicPanorama({ nodes, t }: { nodes: TaxonomyNode[]; t: T }) {
  const mountains = useMemo(() => buildMountains(nodes), [nodes]);
  const [active, setActive] = useState<number | null>(null);

  if (!nodes.length) return null;

  const drawOrder = mountains
    .slice()
    .sort((a, b) => b.peakY - a.peakY || a.idx - b.idx); // tiefster Gipfel zuerst (hinten)

  const activeM = active != null ? mountains.find((m) => m.idx === active) : null;
  const info = activeM
    ? `${activeM.node.name} · ${
        activeM.lean >= 0 ? t("poleSupporters") : t("poleOpponents")
      } · ${signed(activeM.lean)}${activeM.split ? ` · ${t("split")}` : ""}`
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
              {/* Bergkörper, hinten → vorne */}
              {drawOrder.map((m) => (
                <path
                  key={m.idx}
                  d={m.d}
                  fill={m.color}
                  stroke="var(--foreground)"
                  strokeOpacity={active === m.idx ? 0.9 : 0.22}
                  strokeWidth={active === m.idx ? 1.4 : 0.5}
                  style={{ cursor: "pointer", transition: "stroke-opacity .12s" }}
                  onMouseEnter={() => setActive(m.idx)}
                  onMouseLeave={() => setActive(null)}
                />
              ))}

              {/* Leitlinien Gipfel → Label */}
              {mountains.map((m) => (
                <line
                  key={`l-${m.idx}`}
                  x1={m.ringX}
                  y1={m.ringY - 4}
                  x2={m.labelX + 4}
                  y2={58}
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

              {/* Themen-Labels */}
              {mountains.map((m) => (
                <text
                  key={`t-${m.idx}`}
                  x={m.labelX}
                  y={50}
                  textAnchor="start"
                  fontSize={12}
                  fill="var(--muted-foreground)"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setActive(m.idx)}
                  onMouseLeave={() => setActive(null)}
                >
                  {m.label}
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
