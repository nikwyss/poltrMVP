"use client";

/**
 * Taxonomie-Sunburst — die Themen-Hierarchie als konzentrische Ringe (Zentrum =
 * Ballot, Ring 1 = Hauptthemen, weitere Ringe = Subthemen). Ergänzt das
 * Positionsband um die ganze Tiefe der Hierarchie auf einen Blick.
 *
 * Farbe = `proLeaning` ∈ [-1,1] des Viewers (relevanz-gewichtete Pro-Vorlage-
 * Neigung) als kontinuierliche diverging-Skala: rot (auf Gegner-Seite) → neutral
 * → blau (auf Befürworter-Seite). Unbewertet/ohne Login = neutralgrau. Stark
 * gespaltene Knoten (`dissent`) bekommen einen Amber-Rand.
 *
 * Segmentgröße: alle Geschwister gleich breit (Winkel des Elternsegments / Anzahl
 * Geschwister) — die Visualisierung zeigt Struktur & Haltung, nicht Volumen.
 *
 * Reines SVG, keine Chart-Library.
 */
import { useMemo, useState } from "react";
import type { TaxonomyNode } from "@/types/ballots";
import { Card, CardContent } from "@/components/ui/card";

type T = (key: string, values?: Record<string, string | number>) => string;

const SPLIT_THRESHOLD = 0.5;

// Pole — konsistent mit Positionsband / Insight.
const RED: [number, number, number] = [178, 58, 33]; // Gegner-Seite
const BLUE: [number, number, number] = [37, 99, 235]; // Befürworter-Seite
const MID: [number, number, number] = [233, 230, 224]; // neutrale Mitte (warm)
const GREY: [number, number, number] = [214, 217, 222]; // unbewertet
const AMBER = "rgb(217, 159, 40)";

// Geometrie
const SIZE = 420;
const CX = SIZE / 2;
const CY = SIZE / 2;
const CENTER_R = 52; // Radius der Zentrumsscheibe
const OUTER_R = 200; // äusserster Radius
const LABEL_MIN_ANGLE = 9; // ° — schmaler ⇒ kein Label (nur Tooltip)

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function mix(c1: [number, number, number], c2: [number, number, number], t: number): string {
  return `rgb(${lerp(c1[0], c2[0], t)}, ${lerp(c1[1], c2[1], t)}, ${lerp(c1[2], c2[2], t)})`;
}

// proLeaning -1..1 → diverging rot↔neutral↔blau; null = grau.
function fillFor(lean: number | null | undefined): string {
  if (lean == null) return mix(GREY, GREY, 0);
  if (lean >= 0) return mix(MID, BLUE, Math.min(1, lean));
  return mix(MID, RED, Math.min(1, -lean));
}

// Lesbare Label-Farbe (dunkel auf hell, weiss auf kräftig).
function textColor(lean: number | null | undefined): string {
  if (lean == null) return "rgba(0,0,0,0.55)";
  const strength = Math.min(1, Math.abs(lean));
  return strength > 0.45 ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.7)";
}

function polar(r: number, angleDeg: number): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function arcPath(rInner: number, rOuter: number, a0: number, a1: number): string {
  const large = a1 - a0 > 180 ? 1 : 0;
  const [x0o, y0o] = polar(rOuter, a0);
  const [x1o, y1o] = polar(rOuter, a1);
  const [x1i, y1i] = polar(rInner, a1);
  const [x0i, y0i] = polar(rInner, a0);
  return [
    `M ${x0o} ${y0o}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${x1o} ${y1o}`,
    `L ${x1i} ${y1i}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${x0i} ${y0i}`,
    "Z",
  ].join(" ");
}

interface Seg {
  node: TaxonomyNode;
  level: number; // 1 = innerster Ring
  a0: number;
  a1: number;
}

// Equal-share-Layout: jedes Geschwister bekommt denselben Winkelanteil.
function layout(root: TaxonomyNode): { segs: Seg[]; maxLevel: number } {
  const segs: Seg[] = [];
  let maxLevel = 0;
  const walk = (node: TaxonomyNode, level: number, a0: number, a1: number) => {
    if (level >= 1) {
      segs.push({ node, level, a0, a1 });
      if (level > maxLevel) maxLevel = level;
    }
    const kids = node.children ?? [];
    if (!kids.length) return;
    const step = (a1 - a0) / kids.length;
    kids.forEach((c, i) => walk(c, level + 1, a0 + i * step, a0 + (i + 1) * step));
  };
  walk(root, 0, 0, 360);
  return { segs, maxLevel };
}

export function TaxonomySunburst({
  root,
  t,
  onSelect,
}: {
  root: TaxonomyNode;
  t: T;
  onSelect?: (key: string) => void;
}) {
  const [hover, setHover] = useState<TaxonomyNode | null>(null);

  const { segs, ringStep } = useMemo(() => {
    const { segs, maxLevel } = layout(root);
    const ringStep = maxLevel > 0 ? (OUTER_R - CENTER_R) / maxLevel : 0;
    return { segs, ringStep };
  }, [root]);

  if (!segs.length) return null;

  const active = hover ?? root;
  const centerName = hover ? hover.name : t("sunburstCenter");

  return (
    <Card className="border-black/5">
      <CardContent className="pt-6">
        <p className="mb-1 text-xs text-muted-foreground">{t("sunburstTitle")}</p>

        {/* Legende: Pole wie im Positionsband */}
        <div className="mb-3 flex items-center justify-center gap-3 text-[11px] font-medium">
          <span style={{ color: `rgb(${RED.join(",")})` }}>{t("poleOpponents")}</span>
          <span
            className="h-2 w-28 rounded-full"
            style={{
              background: `linear-gradient(90deg, rgb(${RED.join(",")}), rgb(${MID.join(
                ",",
              )}), rgb(${BLUE.join(",")}))`,
            }}
          />
          <span style={{ color: `rgb(${BLUE.join(",")})` }}>{t("poleSupporters")}</span>
        </div>

        <div className="mx-auto w-full max-w-[460px]">
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="h-auto w-full"
            role="img"
            aria-label={t("sunburstTitle")}
          >
            {segs.map((s) => {
              const rInner = CENTER_R + (s.level - 1) * ringStep;
              const rOuter = CENTER_R + s.level * ringStep;
              const span = s.a1 - s.a0;
              const split = (s.node.dissent ?? 0) > SPLIT_THRESHOLD;
              const clickable = !!s.node.key && !!onSelect;
              const mid = (s.a0 + s.a1) / 2;
              const labelR = (rInner + rOuter) / 2;
              const [lx, ly] = polar(labelR, mid);
              // Label tangential ausrichten; auf der linken Hälfte um 180° drehen.
              let rot = mid - 90;
              if (mid > 180) rot += 180;
              const showLabel = span >= LABEL_MIN_ANGLE && ringStep > 16;
              // Sehr grobe Zeichenkapazität entlang des Bogens.
              const maxChars = Math.max(3, Math.floor((span / 360) * 2 * Math.PI * labelR / 6.5));
              const label =
                s.node.name.length > maxChars
                  ? s.node.name.slice(0, Math.max(1, maxChars - 1)) + "…"
                  : s.node.name;
              return (
                <g key={`${s.node.id}-${s.level}`}>
                  <path
                    d={arcPath(rInner, rOuter, s.a0, s.a1)}
                    fill={fillFor(s.node.proLeaning)}
                    stroke={split ? AMBER : "rgba(255,255,255,0.9)"}
                    strokeWidth={split ? 1.8 : 1}
                    style={{
                      cursor: clickable ? "pointer" : "default",
                      opacity: hover && hover !== s.node ? 0.82 : 1,
                      transition: "opacity 120ms",
                    }}
                    onMouseEnter={() => setHover(s.node)}
                    onMouseLeave={() => setHover((h) => (h === s.node ? null : h))}
                    onClick={() => clickable && onSelect!(s.node.key!)}
                  >
                    <title>
                      {s.node.name}
                      {s.node.proLeaning != null
                        ? ` · ${Math.round(s.node.proLeaning * 100)}`
                        : ` · ${t("unrated")}`}
                      {split ? ` · ${t("split")}` : ""}
                      {` · ${s.node.ratedCount ?? 0}/${s.node.argumentCount} ${t("rated")}`}
                    </title>
                  </path>
                  {showLabel && (
                    <text
                      x={lx}
                      y={ly}
                      fill={textColor(s.node.proLeaning)}
                      fontSize={10}
                      textAnchor="middle"
                      dominantBaseline="central"
                      transform={`rotate(${rot} ${lx} ${ly})`}
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Zentrumsscheibe */}
            <circle cx={CX} cy={CY} r={CENTER_R} fill="rgba(0,0,0,0.04)" stroke="rgba(0,0,0,0.06)" />
            <text
              x={CX}
              y={active.proLeaning != null ? CY - 6 : CY}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={13}
              fontWeight={600}
              fill="rgba(0,0,0,0.7)"
              style={{ pointerEvents: "none" }}
            >
              {centerName.length > 14 ? centerName.slice(0, 13) + "…" : centerName}
            </text>
            {hover && active.proLeaning != null && (
              <text
                x={CX}
                y={CY + 11}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fill={fillFor(active.proLeaning)}
                fontWeight={600}
                style={{ pointerEvents: "none" }}
              >
                {Math.round(active.proLeaning * 100)}
              </text>
            )}
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}

export default TaxonomySunburst;
