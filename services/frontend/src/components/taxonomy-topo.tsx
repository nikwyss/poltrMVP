"use client";

/**
 * „Topografie der Zustimmung" — pseudo-topografische Pixel-Landkarte je Thema.
 *
 * Lesart: links das Land (Nein), rechts das Meer (Ja). Jedes Top-Thema ist ein
 * Becken (Zustimmung) oder eine Erhebung (Ablehnung) im Gelände; die Grösse des
 * Themas (Zahl der Argumente) bestimmt, wie weit es ins Gelände ausgreift. Das
 * Höhenfeld ist ein Grundgefälle (links→rechts) plus Gauss-Glocken je Thema —
 * bewusst grob verpixelt gerendert (kein Smoothing), rustikal/kartografisch.
 *
 * Datenquelle: dieselben Knoten wie Sunburst & Likert (`root.children`). Pro Thema:
 *   • mean  ∈ [0,100]  ← nodeLeaning(node) ∈ [−1,1] → (lean+1)·50
 *   • salience         ← node.argumentCount, normiert auf die Geschwister
 * Unbewertete Themen (nodeLeaning === null) werden weggelassen.
 *
 * Farben aus der geteilten Palette (chart-palette.ts): Koralle = Nein, Navy = Ja —
 * identisch zu Sunburst & Likert.
 */
import { useMemo, useState } from "react";
import { forceSimulation, forceCollide, forceX, forceY, forceManyBody } from "d3-force";
import { contours } from "d3-contour";
import { geoPath, geoIdentity } from "d3-geo";
import { extent, range } from "d3-array";
import type { TaxonomyNode } from "@/types/ballots";
import { Card, CardContent } from "@/components/ui/card";
import { nodeLeaning } from "@/lib/aggregate";
import {
  ARM_NO,
  ARM_YES,
  TRACK,
  leanRgb,
  mixRgb,
  rgbStr,
  type RGB,
} from "@/lib/chart-palette";

type T = (key: string, values?: Record<string, string | number>) => string;

const SERIF = {
  fontFamily: 'var(--font-serif), Georgia, "Times New Roman", serif',
} as const;

// Karten-Geometrie (viewBox). CELL = Pixelgrösse: grösser = grober/verpixelter.
const W = 660;
const H = 360;
const CELL = 10;
const NX = Math.floor(W / CELL);
const NY = Math.floor(H / CELL);

const NO_CSS = rgbStr(ARM_NO);
const YES_CSS = rgbStr(ARM_YES);
const INK: RGB = [42, 42, 34];
const INK_CSS = rgbStr(INK);
// Dunklere Pol-Töne für die Höhenlinien (Land = korallen, Meer = navy).
const LINE_YES = rgbStr(mixRgb(ARM_YES, INK, 0.45));
const LINE_NO = rgbStr(mixRgb(ARM_NO, INK, 0.45));

type Topic = {
  id: number;
  key: string | null;
  name: string;
  mean: number; // ∈ [0,100]
  salience: number; // normiert ~40..260
  argCount: number;
};

type Placed = Topic & { x: number; y: number };

const radiusFor = (s: number) => 22 + Math.sqrt(s) * 2.2;

// Force-Layout: Grundtendenz drückt Themen grob nach links/rechts (Ja eher rechts),
// damit Lage und Farbe zusammenpassen. Deterministisch (distinkte Startpositionen),
// `.stop().tick()` statt Animation.
function layout(topics: Topic[]): Placed[] {
  const nodes: Placed[] = topics.map((t, i) => ({
    ...t,
    x: W * (0.2 + (t.mean / 100) * 0.6),
    y: H / 2 + Math.sin(i * 2.39996) * 95,
  }));
  forceSimulation(nodes)
    .force(
      "collide",
      forceCollide<Placed>().radius((d) => radiusFor(d.salience) + 16).strength(1),
    )
    .force("x", forceX<Placed>((d) => W * (0.2 + (d.mean / 100) * 0.6)).strength(0.045))
    .force("y", forceY<Placed>((_d, i) => H / 2 + Math.sin(i * 2.39996) * 70).strength(0.04))
    .force("charge", forceManyBody().strength(-22))
    .stop()
    .tick(300);
  nodes.forEach((n) => {
    const r = radiusFor(n.salience);
    n.x = Math.max(r, Math.min(W - r, n.x));
    n.y = Math.max(r + 12, Math.min(H - r - 12, n.y));
  });
  return nodes;
}

// Höhenfeld = Grundgefälle (links→rechts) + Themen-Glocken (Abweichung von Tendenz).
function buildField(nodes: Placed[]): Float64Array {
  const v = new Float64Array(NX * NY);
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const px = i * CELL + CELL / 2;
      const py = j * CELL + CELL / 2;
      // Grundgefälle: sanft (links leicht Land, rechts leicht Meer).
      let h = (px / W - 0.5) * 34;
      // sanfte Wellen, damit Küste/Gelände organisch wirken.
      h += Math.sin((py / H) * Math.PI * 2.2 + (px / W) * 1.5) * 5;
      // Themen modellieren lokale Erhebung/Senke relativ zum Grundniveau.
      for (const n of nodes) {
        const target = n.mean - 50;
        const baseAt = (n.x / W - 0.5) * 34;
        const amp = (target - baseAt) * 1.25;
        const sigma = radiusFor(n.salience) * 0.85;
        const dx = px - n.x;
        const dy = py - n.y;
        const d2 = (dx * dx + dy * dy) / (2 * sigma * sigma);
        h += amp * Math.exp(-d2);
      }
      v[j * NX + i] = h;
    }
  }
  return v;
}

export function TaxonomyTopo({
  nodes,
  t,
  onSelect,
}: {
  nodes: TaxonomyNode[];
  t: T;
  /** Klick auf ein Thema öffnet das Thema (Topic-Detail). */
  onSelect?: (key: string) => void;
}) {
  const [showContours, setShowContours] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);

  // Reale Knoten → Topics. Nur bewertete (nodeLeaning ≠ null); Salience aus der
  // Argument-Zahl, normiert auf die Geschwister.
  const topics = useMemo<Topic[]>(() => {
    const maxC = Math.max(1, ...nodes.map((n) => n.argumentCount ?? 0));
    const out: Topic[] = [];
    for (const n of nodes) {
      const lean = nodeLeaning(n);
      if (lean == null) continue;
      const argCount = n.argumentCount ?? 0;
      out.push({
        id: n.id,
        key: n.key ?? null,
        name: n.name,
        mean: (lean + 1) * 50,
        salience: 40 + (argCount / maxC) * 220,
        argCount,
      });
    }
    return out;
  }, [nodes]);

  const layoutKey = topics
    .map((t) => `${t.id}:${Math.round(t.mean)}:${Math.round(t.salience)}`)
    .join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const placed = useMemo(() => layout(topics), [layoutKey]);
  const field = useMemo(() => buildField(placed), [placed]);
  const fieldArr = useMemo(() => Array.from(field), [field]);

  const absMax = useMemo(() => {
    const e = extent(field);
    return Math.max(Math.abs(e[0] ?? 0), Math.abs(e[1] ?? 0), 1);
  }, [field]);

  // Feldwert h → lean ∈ [−1,1] → Füllton (Koralle ↔ TRACK ↔ Navy).
  const colorAt = useMemo(() => {
    return (h: number) => {
      const lean = Math.max(-1, Math.min(1, h / absMax));
      return rgbStr(leanRgb(lean) ?? TRACK);
    };
  }, [absMax]);

  const path = useMemo(() => geoPath(geoIdentity().scale(CELL)), []);

  // Pixel-Zellen (grob, ohne Smoothing).
  const cells = useMemo(() => {
    const out: { x: number; y: number; c: string }[] = [];
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        out.push({ x: i * CELL, y: j * CELL, c: colorAt(field[j * NX + i]) });
      }
    }
    return out;
  }, [field, colorAt]);

  // Höhenlinien — kantig (smooth false), verpixelt.
  const isoLines = useMemo(() => {
    const levels = range(-absMax, absMax, absMax / 5).filter((x) => Math.abs(x) > 1);
    return contours()
      .size([NX, NY])
      .smooth(false)
      .thresholds(levels)(fieldArr)
      .map((g) => ({ d: path(g), value: g.value }));
  }, [fieldArr, absMax, path]);

  if (!topics.length) return null;

  const XMID = W / 2; // 50 %-Trennlinie (Zustimmungs-Achse)

  return (
    <Card className="border-black/5 py-6">
      <CardContent className="px-6">
        {/* Eyebrow */}
        <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t("topoEyebrow")} · {topics.length} {t("cloudThemes")}
        </p>
        {/* Serifen-Titel */}
        <p
          className="mb-1.5 text-[1.5rem] leading-tight tracking-tight text-foreground"
          style={SERIF}
        >
          {t("topoTitle")}
        </p>
        <p className="mb-3 text-[13.5px] leading-relaxed text-muted-foreground">
          {t("topoSubtitle")}
        </p>

        <div className="mb-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowContours((c) => !c)}
            className="rounded-md border border-foreground/15 px-2.5 py-1 text-[12px] font-medium text-foreground/80 transition hover:bg-foreground/[0.04]"
            aria-pressed={showContours}
          >
            {showContours ? "✓ " : ""}
            {t("topoContours")}
          </button>
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {NX}×{NY} · {CELL}px
          </span>
        </div>

        {/* Karte: grobes Pixel-Gelände auf „Papier". */}
        <div className="border border-black/10 bg-[#f3eedf] p-1.5">
          <div className="relative">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="block h-auto w-full"
              style={{ imageRendering: "pixelated" }}
              shapeRendering="crispEdges"
              role="img"
              aria-label={t("topoTitle")}
            >
              {/* Pixel-Raster */}
              {cells.map((c, k) => (
                <rect key={k} x={c.x} y={c.y} width={CELL} height={CELL} fill={c.c} />
              ))}

              {/* Höhenlinien — kantig */}
              {showContours &&
                isoLines.map((l, k) =>
                  l.d ? (
                    <path
                      key={k}
                      d={l.d}
                      fill="none"
                      stroke={l.value >= 0 ? LINE_YES : LINE_NO}
                      strokeWidth={0.6}
                      opacity={0.4}
                      shapeRendering="crispEdges"
                    />
                  ) : null,
                )}

              {/* 50%-Trennlinie (Zustimmungs-Achse), gepunktet */}
              <line
                x1={XMID}
                y1={0}
                x2={XMID}
                y2={H}
                stroke={INK_CSS}
                strokeWidth={1.2}
                strokeDasharray="2 5"
                opacity={0.4}
              />

              {/* Themen-Marker (Beschriftung als HTML-Overlay darüber) */}
              {placed.map((n) => {
                const col = n.mean >= 50 ? YES_CSS : NO_CSS;
                const isSel = selected === n.id;
                return (
                  <circle
                    key={n.id}
                    cx={n.x}
                    cy={n.y}
                    r={isSel ? 5.5 : 4}
                    fill={col}
                    stroke="#fff"
                    strokeWidth={1.5}
                  />
                );
              })}
            </svg>

            {/* Orientierungs-Pillen in den Ecken */}
            <div
              className="pointer-events-none absolute left-2 top-2 rounded-md border bg-white/80 px-2 py-0.5 text-[12px] font-semibold backdrop-blur-[1px]"
              style={{ color: NO_CSS, borderColor: "rgba(202,112,88,0.4)" }}
            >
              {t("topoPoleNo")}
            </div>
            <div
              className="pointer-events-none absolute right-2 top-2 rounded-md border bg-white/80 px-2 py-0.5 text-[12px] font-semibold backdrop-blur-[1px]"
              style={{ color: YES_CSS, borderColor: "rgba(60,90,143,0.4)" }}
            >
              {t("topoPoleYes")}
            </div>

            {/* Themen-Beschriftungen: Serif-Name + dezenter Untertitel, über dem
                Marker schwebend (scharfe Typografie statt SVG-Text). */}
            {placed.map((n) => {
              const col = n.mean >= 50 ? YES_CSS : NO_CSS;
              const clickable = !!n.key && !!onSelect;
              return (
                <button
                  key={n.id}
                  type="button"
                  disabled={!clickable}
                  onClick={() => {
                    setSelected((s) => (s === n.id ? null : n.id));
                    if (clickable) onSelect!(n.key!);
                  }}
                  className={`absolute z-10 flex -translate-x-1/2 -translate-y-[calc(100%+9px)] flex-col items-center text-center leading-tight ${clickable ? "cursor-pointer" : "cursor-default"}`}
                  style={{ left: `${(n.x / W) * 100}%`, top: `${(n.y / H) * 100}%` }}
                  aria-label={`${n.name} · ${Math.round(n.mean)}% · n=${n.argCount}`}
                >
                  <span
                    className={`whitespace-nowrap text-[14px] font-medium text-foreground/90 [text-shadow:0_1px_2px_rgba(243,238,223,0.9),0_0_3px_rgba(243,238,223,0.9)] ${clickable ? "group-hover:underline" : ""}`}
                    style={SERIF}
                  >
                    {n.name}
                  </span>
                  <span
                    className="whitespace-nowrap font-mono text-[10px] [text-shadow:0_1px_2px_rgba(243,238,223,0.9)]"
                    style={{ color: col }}
                  >
                    {Math.round(n.mean)}% · n={n.argCount}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Zustimmungs-Achse: 0 % links · 50 % Mitte · 100 % rechts */}
          <div className="mt-1.5 px-1">
            <div className="h-px w-full bg-black/10" />
            <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
              <span>0% {t("topoAgreement")}</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default TaxonomyTopo;
