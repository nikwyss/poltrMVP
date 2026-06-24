"use client";

/**
 * Halbkreis-„Fächer" je Thema. Ein Halbkreis (obere Hälfte) spannt von „Nein"
 * (ganz links, 180°) bis „Ja" (ganz rechts, 0°), die neutrale Mitte liegt oben
 * (90°). Jedes Thema ist EIN Ring (konzentrisch, ein Ring je Thema) und darauf
 * eine farbige Bogen-LINIE (kein Sektor):
 *
 *   • Der WINKEL des Bogens = die aggregierte Haltung des Themas (`nodeLeaning`,
 *     Soft-OR — dieselbe Zahl wie in Likert/Sunburst/Topo). Lehnt das Thema
 *     Richtung Ja, sitzt der Bogen rechts; Richtung Nein, links.
 *   • Die WINKELBREITE des Bogens = Anzahl Argumente im Thema (mehr Argumente =
 *     breiterer Bogen). Der Bogen ist um den Haltungs-Winkel zentriert.
 *
 * Die Ringe sind nach Argumentzahl absteigend gestapelt — das meistdiskutierte
 * Thema liegt aussen (grösster Bogen). Unbewertete Themen zeigen nur die
 * gestrichelte Schiene (wie der „provisorische" Rand in Likert/Sunburst).
 *
 * Farben + Haltungs-Aggregierung kommen aus der geteilten Palette/Logik
 * (chart-palette.ts, aggregate.ts) — keine eigene Farb- oder Mittelungsmathematik.
 */
import { useMemo, type ReactNode } from "react";
import type { TaxonomyNode } from "@/types/ballots";
import { Card, CardContent } from "@/components/ui/card";
import { nodeLeaning } from "@/lib/aggregate";
import { leanRgb, rgbStr, TRACK_CSS, type RGB } from "@/lib/chart-palette";

type T = (key: string, values?: Record<string, string | number>) => string;

const SERIF = {
  fontFamily: 'var(--font-serif), Georgia, "Times New Roman", serif',
} as const;

// Pol-Tönungen — identisch mit den Badge-Farben in diverging-likert.tsx.
const POLE_NO = "rgb(166, 78, 54)"; // korallen / Nein (links)
const POLE_YES = "rgb(56, 84, 134)"; // navy / Ja (rechts)

// Text auf der farbigen Bogen-Linie: dunkle Tinte auf hellem Band, sonst hell.
const INK: RGB = [51, 42, 34];
const PAPER: RGB = [252, 250, 246];

/* ---------- Geometrie (viewBox 600 × H) ---------- */
const VW = 600;
const CX = VW / 2; // 300 — Zentrum (unten, Mitte des Durchmessers)
const R_OUTER = 250;
const R_INNER = 76;
const TOP_PAD = 10; // Luft über dem äussersten Ring
const CY = R_OUTER + TOP_PAD; // Basislinie (Durchmesser)
const VH = CY + 34; // Platz unter der Basislinie für Pol-Labels

const MIN_DEG = 11; // Winkelbreite bei wenigsten Argumenten
const MAX_DEG = 72; // Winkelbreite beim meistdiskutierten Thema

const TAU = Math.PI / 180;

// Punkt auf dem Halbkreis. aDeg ∈ [0,180]: 0° = rechts (Ja), 180° = links (Nein),
// 90° = oben (neutral). y-Achse nach unten ⇒ obere Hälfte über sin.
function pt(r: number, aDeg: number): [number, number] {
  const a = aDeg * TAU;
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
}

// Bogen-Linie von a0 nach a1 (a1 > a0 ⇒ rechts→links, visuell gegen den
// Uhrzeigersinn ⇒ sweep 0). Nur Mittellinie, gestrichen (kein Füll-Sektor).
function arc(r: number, a0: number, a1: number): string {
  const [x0, y0] = pt(r, a0);
  const [x1, y1] = pt(r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 0 ${x1} ${y1}`;
}

// Pfad für aufrechten gekrümmten Text: vom linken (grösseren) zum rechten
// (kleineren) Winkel über den Scheitel ⇒ links→rechts, sweep 1.
function textArc(r: number, aCenter: number, halfSpan: number): string {
  const [xs, ys] = pt(r, aCenter + halfSpan);
  const [xe, ye] = pt(r, aCenter - halfSpan);
  return `M ${xs} ${ys} A ${r} ${r} 0 0 1 ${xe} ${ye}`;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

// Relative Luminanz → Textfarbe (dunkel auf hell, hell auf dunkel).
function inkOn(rgb: RGB): string {
  const l = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  return rgbStr(l > 0.62 ? INK : PAPER);
}

type Row = {
  node: TaxonomyNode;
  lean: number | null; // ∈ [−1,1] oder null (unbewertet)
  argCount: number;
  name: string;
  key: string | null;
};

export function TaxonomyRadial({
  nodes,
  t,
  onSelect,
}: {
  nodes: TaxonomyNode[];
  t: T;
  /** Klick auf ein Thema öffnet das Thema (Topic-Detail). */
  onSelect?: (key: string) => void;
}) {
  const rows = useMemo<Row[]>(() => {
    return nodes
      .map((node) => ({
        node,
        lean: nodeLeaning(node),
        argCount: node.argumentCount ?? 0,
        name: node.name,
        key: node.key ?? null,
      }))
      // Meistdiskutiertes Thema aussen (grösster Ring/Bogen).
      .sort((a, b) => b.argCount - a.argCount);
  }, [nodes]);

  if (!rows.length) return null;

  const N = rows.length;
  const pitch = (R_OUTER - R_INNER) / N; // radialer Abstand der Ringe
  const bandW = clamp(pitch * 0.62, 6, 26); // Linienstärke der Bögen
  const fontSize = clamp(bandW * 0.62, 8, 12);

  // Argument-Domäne für die Winkelbreiten-Skala.
  const counts = rows.map((r) => r.argCount);
  const minC = Math.min(...counts);
  const maxC = Math.max(...counts);
  const widthFor = (c: number) =>
    maxC === minC
      ? (MIN_DEG + MAX_DEG) / 2
      : MIN_DEG + ((c - minC) / (maxC - minC)) * (MAX_DEG - MIN_DEG);

  return (
    <Card className="border-black/5 py-6">
      <CardContent className="px-6">
        <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t("radialEyebrow")} · {N} {t("cloudThemes")}
        </p>
        <p
          className="mb-1.5 text-[1.5rem] leading-tight tracking-tight text-foreground"
          style={SERIF}
        >
          {t("radialTitle")}
        </p>
        <p className="mb-4 text-[13.5px] leading-relaxed text-muted-foreground">
          {t("radialSubtitle")}
        </p>

        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          className="block h-auto w-full"
          role="img"
          aria-label={t("radialTitle")}
        >
          {/* Basislinie (Durchmesser) + neutrale Marke oben */}
          <line
            x1={CX - R_OUTER}
            y1={CY}
            x2={CX + R_OUTER}
            y2={CY}
            stroke="var(--line-mid, rgba(0,0,0,0.18))"
            strokeWidth={1}
            strokeOpacity={0.7}
          />
          <line
            x1={CX}
            y1={CY - R_INNER + bandW / 2}
            x2={CX}
            y2={CY - R_OUTER - 4}
            stroke="var(--line-mid, rgba(0,0,0,0.18))"
            strokeWidth={1}
            strokeDasharray="2 3"
            strokeOpacity={0.5}
          />

          {rows.map((row, i) => {
            const r = R_OUTER - (i + 0.5) * pitch; // aussen = i 0
            const rated = row.lean != null;
            const fill = rated ? leanRgb(row.lean) : null;
            const fillCss = fill ? rgbStr(fill) : TRACK_CSS;

            // Haltungs-Winkel + Bogenbreite (um den Winkel zentriert, an Polen geklemmt).
            const aCenter = 90 * (1 - (row.lean ?? 0));
            const half = widthFor(row.argCount) / 2;
            const a0 = clamp(aCenter - half, 0, 180);
            const a1 = clamp(aCenter + half, 0, 180);

            // Passt der Themenname auf die Bogenlänge? (grob: Zeichenbreite ≈ 0.55·fs)
            const arcLenPx = r * (a1 - a0) * TAU;
            const maxChars = Math.floor(arcLenPx / (fontSize * 0.55));
            const label =
              rated && maxChars >= 3
                ? row.name.length > maxChars
                  ? `${row.name.slice(0, Math.max(1, maxChars - 1))}…`
                  : row.name
                : null;

            const clickable = !!row.key && !!onSelect;
            const lblId = `radial-lbl-${row.node.id}`;
            const select = clickable ? () => onSelect!(row.key!) : undefined;

            const content: ReactNode = (
              <>
                {/* Schiene: voller Halbring. Unbewertet ⇒ gestrichelt. */}
                <path
                  d={arc(r, 0, 180)}
                  fill="none"
                  stroke={TRACK_CSS}
                  strokeWidth={bandW}
                  strokeLinecap="round"
                  strokeOpacity={rated ? 0.55 : 0.7}
                  strokeDasharray={rated ? undefined : "2 4"}
                />
                {/* Themen-Bogen (Linie): Winkel = Haltung, Breite = Argumentzahl. */}
                {rated && (
                  <path
                    d={arc(r, a0, a1)}
                    fill="none"
                    stroke={fillCss}
                    strokeWidth={bandW}
                    strokeLinecap="round"
                  />
                )}
                {/* Gekrümmtes Label auf dem Bogen, falls es passt. */}
                {label && fill && (
                  <>
                    <defs>
                      <path id={lblId} d={textArc(r, aCenter, half)} fill="none" />
                    </defs>
                    <text
                      fontSize={fontSize}
                      fontWeight={600}
                      fill={inkOn(fill)}
                      style={SERIF}
                    >
                      <textPath href={`#${lblId}`} startOffset="50%" textAnchor="middle">
                        {label}
                      </textPath>
                    </text>
                  </>
                )}
                {/* Unsichtbare, breitere Trefferfläche je Ring (Hover/Klick + Tooltip). */}
                <path
                  d={arc(r, 0, 180)}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={pitch}
                  strokeLinecap="butt"
                >
                  <title>
                    {rated
                      ? `${row.name} · ${row.argCount} ${t("cloudThemes")}`
                      : `${row.name} · ${t("unrated")}`}
                  </title>
                </path>
              </>
            );

            if (!clickable) return <g key={row.node.id}>{content}</g>;
            return (
              <g
                key={row.node.id}
                role="button"
                tabIndex={0}
                aria-label={row.name}
                className="cursor-pointer outline-none [&_path:last-of-type]:hover:stroke-black/[0.04]"
                onClick={select}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    select!();
                  }
                }}
              >
                {content}
              </g>
            );
          })}

          {/* Pol-Beschriftung an den Enden des Durchmessers */}
          <text
            x={CX - R_OUTER}
            y={CY + 20}
            fontSize={12}
            fontWeight={600}
            textAnchor="start"
            fill={POLE_NO}
            className="uppercase"
            style={{ letterSpacing: "0.08em" }}
          >
            ← {t("cloudArmNo")}
          </text>
          <text
            x={CX + R_OUTER}
            y={CY + 20}
            fontSize={12}
            fontWeight={600}
            textAnchor="end"
            fill={POLE_YES}
            className="uppercase"
            style={{ letterSpacing: "0.08em" }}
          >
            {t("cloudArmYes")} →
          </text>
        </svg>
      </CardContent>
    </Card>
  );
}

export default TaxonomyRadial;
