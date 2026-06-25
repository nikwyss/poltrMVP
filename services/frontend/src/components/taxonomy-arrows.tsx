"use client";

/**
 * „Kräfte-Pfeile" je Thema. Dieselben Daten wie der Soft-OR-Balken
 * (diverging-likert.tsx), aber als zwei gegenläufige PFEILE gelesen — zwei
 * Kräfte, die in entgegengesetzte Richtungen ziehen:
 *
 *   ◄── korallener Pfeil nach LINKS  = „spricht für ein Nein" (Kontra, Länge K)
 *       navy Pfeil nach RECHTS  ──►  = „spricht für ein Ja"  (Pro,   Länge P)
 *
 * „Kräftefeld" (Ziel: Ambivalenz maximal sichtbar):
 * Die rohen Kräfte P (Pro) und K (Kontra) liegen als zwei sehr blasse, gleich
 * breite Hintergrundpfeile (gegenläufig) auf der 0-Achse — die Kräfteebene.
 * Statt eines Netto-Pfeils sitzt an der Netto-Position (Schwerpunkt der beiden
 * Vektoren, XC + (P − K)·ARM_SPAN) ein dunkles Bubble-Zeichen gleicher Höhe wie
 * die Roh-Vektoren. Zwei lange Hintergrundpfeile + Bubble nahe der Mitte ⇒
 * umstritten.
 *
 * Aggregierung + Farben kommen aus der geteilten Logik/Palette (aggregate.ts,
 * chart-palette.ts) — identisch zu Likert/Sunburst/Topo/Radial.
 */
import { useMemo, type ReactNode } from "react";
import type { TaxonomyNode } from "@/types/ballots";
import { Card, CardContent } from "@/components/ui/card";
import { collectLeaningContribs, noisyOr } from "@/lib/aggregate";
import {
  ARM_NO_CSS as ARM_NO,
  ARM_YES_CSS as ARM_YES,
} from "@/lib/chart-palette";

type T = (key: string) => string;

const SERIF = {
  fontFamily: 'var(--font-serif), Georgia, "Times New Roman", serif',
} as const;

// Tendenz-Badge: blau getönt Richtung Ja, korallen Richtung Nein.
const POS = { bg: "rgba(60, 90, 143, 0.12)", fg: "rgb(56, 84, 134)" };
const NEG = { bg: "rgba(202, 112, 88, 0.16)", fg: "rgb(166, 78, 54)" };
const ZERO = { bg: "rgba(0,0,0,0.05)", fg: "var(--muted-foreground)" };

// Bubble-Farben: nah an den Roh-Pfeil-Grundtönen (nur voll deckend statt blass)
// ⇒ harmoniert mit dem eigenen Hintergrundpfeil, weniger harter Kontrast.
const NET_YES = "rgb(70, 98, 144)"; // gedämpftes Navy (Ja)
const NET_NO = "rgb(190, 102, 78)"; // gedämpftes Terrakotta (Nein)

/* ---------- Achsen-Geometrie (viewBox-Breite 600) ---------- */
const VW = 600;
const VH = 34;
const PAD = 12;
const X0 = PAD;
const X1 = VW - PAD;
const XC = (X0 + X1) / 2; // 0-Achse (Mitte)
const HALF = (X1 - X0) / 2;
const CY = VH / 2; // vertikale Mitte
const CGAP = 2; // minimale Lücke je Seite zur Mittellinie (Achse liegt oben drüber)
const ARM_SPAN = HALF - CGAP; // px-Länge eines Pfeils bei Score = 1

// „Stille Skala": feine gepunktete Hilfslinien bei Anteilen der Armlänge, damit
// Pfeillängen (rohe Kräfte & Netto) ablesbar werden — man sieht, wie viel
// „klar" > „leicht" ist. Nur 50/100 % tragen eine kleine Zahl.
const SCALE_TICKS = [0.25, 0.5, 0.75, 1] as const;
const SCALE_LABELED = [0.5, 1] as const;
const SCALE_LINE = "var(--line-mid, rgba(0,0,0,0.18))";

const MIN_LEN = 6; // ab hier wird ein Pfeil überhaupt gezeichnet

const PAPER = "rgb(252, 250, 246)"; // Halo-/Hintergrundton
const HALO_W = 1.6; // Breite des hellen Rands um den Netto-Pfeil (px nach aussen)

// „Kräftefeld": RAW = zwei sehr blasse, gleich breite Hintergrundpfeile (die
// rohen Gegenkräfte P/K) als Kräfteebene. Die Resultierende wird NICHT mehr als
// Pfeil gezeichnet, sondern als dunkles Bubble-Zeichen (siehe renderBubble).
type ArrowDims = {
  shaft: number; // Schaftstärke
  headLen: number; // Länge der Pfeilspitze
  headHalf: number; // halbe Höhe der Pfeilspitze
  opacity: number;
  halo?: string; // optionaler heller Rand
  filter?: string; // optionaler SVG-Filter (z. B. Bleistift-Optik)
};
const RAW_ARROW: ArrowDims = {
  shaft: 16,
  headLen: 18,
  headHalf: 13,
  opacity: 0.13,
};

// −/+ mit echtem Minuszeichen, z. B. „+46", „−28". v ∈ [−1,1] → Prozentpunkte.
// Nur noch für aria-label / Tooltip (präzise), nicht mehr im sichtbaren Badge.
function signed(v: number): string {
  const n = Math.round(v * 100);
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return "0";
}

// Zwei getrennte Signale: RICHTUNG (Netto P − K) und AMBIVALENZ (zwei starke
// Gegenkräfte). Ein kleiner Netto-Wert bei zwei LANGEN Pfeilen ist nicht „leicht
// für …", sondern umstritten — die Differenz ist klein RELATIV zur Pfeilenlänge.
const BALANCED = 0.1; // |Netto| darunter ⇒ ausgeglichen (richtungslos)
const CLEAR = 0.4; // |Netto| darüber ⇒ „Klar für …", sonst „Leicht für …"
const AMBIV_MIN_FORCE = 0.4; // längerer Pfeil muss mind. so stark sein …
const AMBIV_REL = 0.35; // … und die Differenz < 35 % davon ⇒ ambivalent

type Kind = "unrated" | "ambivalent" | "balanced" | "yes" | "no";

// Einordnung aus den beiden ANGEZEIGTEN Pfeilkräften P, K (Soft-OR). Bewusst aus
// P/K (nicht dem geteilten nodeDissent über Rohsummen), damit das Label exakt zu
// den sichtbaren Pfeillängen passt: zwei lange, fast gleiche Pfeile ⇒ ambivalent.
function classifyKind(P: number, K: number, n: number): Kind {
  if (n === 0) return "unrated";
  const net = P - K;
  const longArm = Math.max(P, K);
  const rel = longArm > 0 ? Math.abs(net) / longArm : 0;
  if (longArm >= AMBIV_MIN_FORCE && rel < AMBIV_REL) return "ambivalent";
  if (Math.abs(net) < BALANCED) return "balanced";
  return net > 0 ? "yes" : "no";
}

// Qualitatives Stärke-Label statt Rohzahl — sinngemäss wie die Slider-Stufen.
function kindLabel(t: T, kind: Kind, net: number): string {
  const a = Math.abs(net);
  switch (kind) {
    case "ambivalent":
      return t("arrowsAmbivalent");
    case "balanced":
      return t("arrowsBalanced");
    case "yes":
      return a < CLEAR ? t("arrowsSlightYes") : t("arrowsClearYes");
    case "no":
      return a < CLEAR ? t("arrowsSlightNo") : t("arrowsClearNo");
    default:
      return "—";
  }
}

// Pfeil-Silhouette als EIN Pfad: flacher Schwanz an der 0-Achse (Kraft „ab Null",
// nicht schwebend), gerader Schaft, bündig anschliessende Dreiecksspitze — keine
// Naht/Lücke zwischen Schaft und Spitze.
function arrowPath(
  innerX: number,
  tipX: number,
  baseX: number,
  dir: 1 | -1,
  s: number, // halbe Schaftstärke
  hh: number, // halbe Spitzenhöhe
): string {
  const top = CY - s;
  const bot = CY + s;
  return [
    `M ${innerX} ${top}`, // flache Schwanzkante an der 0-Achse
    `L ${baseX} ${top}`, // Schaft-Oberkante bis Spitzenbasis
    `L ${baseX} ${CY - hh}`, // hoch zur Spitzenschulter
    `L ${tipX} ${CY}`, // zur Spitze
    `L ${baseX} ${CY + hh}`, // runter zur unteren Schulter
    `L ${baseX} ${bot}`, // Schaft-Unterkante
    `L ${innerX} ${bot}`, // zurück zur flachen Schwanzkante
    "Z",
  ].join(" ");
}

// Ein Pfeil ab der Haarlinie nach `dir` (+1 rechts / −1 links), Länge `len` px.
// `d` steuert Stärke/Spitzengrösse/Deckkraft + optionalen Halo (NET_ARROW =
// scharf mit hellem Rand, RAW_ARROW = fett & blass). Der Halo ist ein Stroke,
// der per paint-order UNTER die Füllung gelegt wird → nur der äussere Rand bleibt.
function renderArrow(
  len: number,
  dir: 1 | -1,
  color: string,
  d: ArrowDims,
): ReactNode {
  if (len < MIN_LEN) return null;
  const innerX = XC + dir * CGAP;
  const tipX = innerX + dir * len;
  const baseX = innerX + dir * Math.max(0, len - d.headLen); // Übergang Schaft→Spitze
  return (
    <g opacity={d.opacity}>
      <path
        d={arrowPath(innerX, tipX, baseX, dir, d.shaft / 2, d.headHalf)}
        fill={color}
        stroke={d.halo ?? "none"}
        strokeWidth={d.halo ? HALO_W * 2 : 0}
        strokeLinejoin="round"
        style={{ paintOrder: "stroke" }}
        filter={d.filter}
      />
    </g>
  );
}

// Netto-Zeichen statt Netto-Pfeil: ein dunkles Badge/Bubble (Pille) an der
// Netto-Position auf der Achse — dem Schwerpunkt der beiden Gegenkräfte
// (XC + (P − K)·ARM_SPAN). GLEICHE HÖHE wie die Roh-Vektoren. Farbe nach
// Richtung; ausgeglichen/ambivalent ⇒ neutral-dunkel. Intuitiver als ein Pfeil:
// die Bubble sitzt schlicht dort, wohin die beiden Kräfte das Thema per Saldo
// ziehen.
const BUBBLE_H = RAW_ARROW.shaft; // gleiche Höhe wie die Roh-Vektoren
const BUBBLE_W = 16; // Breite der Pille (rein als Zeichen, ohne Skalen-Bedeutung)
const BUBBLE_NEUTRAL = "rgb(124, 130, 138)"; // neutral, gedämpft bei ausgeglichen/ambivalent

function renderBubble(
  tendency: number,
  winForce: number, // = max(P, K) ∈ [0,1]: Länge des gewinnenden Roh-Pfeils
  kind: Kind,
): ReactNode {
  const half = BUBBLE_W / 2;
  const s = BUBBLE_H / 2;
  const dir: 1 | -1 = tendency >= 0 ? 1 : -1;
  const winLen = winForce * ARM_SPAN; // Länge des gewinnenden Roh-Pfeils
  const fill =
    kind === "yes" ? NET_YES : kind === "no" ? NET_NO : BUBBLE_NEUTRAL;

  // Position als Auslenkung nach AUSSEN (Richtung der gewinnenden Spitze).
  const netOut = Math.abs(tendency) * ARM_SPAN; // Schwerpunkt = |P − K|·ARM_SPAN
  // Deckel „etwas dazwischen": die Bubble-Außenkante darf bis zur MITTE der
  // Spitze ragen (halbe Spitzenlänge hinein), also winLen − headLen/2 ⇒ die
  // äußere Hälfte der Spitze bleibt frei. cx_out + half ≤ winLen − headLen/2.
  const limitOut = Math.max(0, winLen - RAW_ARROW.headLen / 2 - half);
  const out = Math.min(netOut, limitOut);

  let cx = XC + dir * out;
  cx = Math.max(X0 + half, Math.min(X1 - half, cx)); // im Plot halten

  return (
    <rect
      x={cx - half}
      y={CY - s}
      width={BUBBLE_W}
      height={BUBBLE_H}
      rx={s}
      fill={fill}
    />
  );
}

// Vertikale Skalenlinien für die durchgängige Hintergrund-Ebene. y in viewBox-
// Höhe 0..100, per preserveAspectRatio="none" auf die volle Plot-Höhe gestreckt
// ⇒ EINE durchgehende Linie über alle Zeilen (statt pro Zeile unterbrochen).
// Strichmuster/Breite via non-scaling-stroke in Screen-px (streckungs-unabhängig).
// Die volle Armlänge (100 %) etwas kräftiger als die Zwischenstriche.
function scaleLines(): ReactNode {
  return SCALE_TICKS.flatMap((f) =>
    ([1, -1] as const).map((dir) => {
      const x = XC + dir * f * ARM_SPAN;
      return (
        <line
          key={`grid-${f}-${dir}`}
          x1={x}
          y1={0}
          x2={x}
          y2={100}
          stroke={SCALE_LINE}
          strokeWidth={1.2}
          strokeDasharray="1.5 4"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          opacity={f === 1 ? 0.6 : 0.42}
        />
      );
    }),
  );
}

type Row = {
  node: TaxonomyNode;
  n: number;
  P: number; // Soft-OR Pro (Ja) ∈ [0,1]
  K: number; // Soft-OR Kontra (Nein) ∈ [0,1]
  tendency: number; // P − K ∈ [−1,1]
};

export function TaxonomyArrows({
  nodes,
  t,
  onSelect,
}: {
  nodes: TaxonomyNode[];
  t: T;
  /** Klick auf die Themen-Beschriftung öffnet das Thema (Topic-Detail). */
  onSelect?: (key: string) => void;
}) {
  const rows = useMemo<Row[]>(() => {
    const built = nodes.map((node) => {
      const cs = collectLeaningContribs(node);
      const P = noisyOr(cs.filter((c) => c > 0));
      const K = noisyOr(cs.filter((c) => c < 0).map((c) => -c));
      return { node, n: cs.length, P, K, tendency: P - K };
    });
    // Leaderboard: nach Tendenz (P − K); unbewertete ans Ende.
    return built.sort((a, b) => {
      if (a.n === 0 || b.n === 0) return a.n === 0 ? (b.n === 0 ? 0 : 1) : -1;
      return b.tendency - a.tendency;
    });
  }, [nodes]);

  if (!nodes.length) return null;

  // Feste Label-/Badge-Spalten — gleiche Spaltenbreiten in JEDER Zeile (und in
  // der durchgehenden 0-Achse + Pol-Zeile), damit die mittlere 1fr-Spalte überall
  // exakt gleich liegt. Badge-Spalte breiter als bei DivergingLikert, weil hier
  // ein qualitatives Wort-Label statt einer Rohzahl steht.
  const rowGrid =
    "grid grid-cols-[clamp(140px,32%,230px)_1fr_6.75rem] items-center gap-4";

  return (
    <Card className="border-black/5 py-6">
      <CardContent className="px-6">
        {/* Bleistift-Filter für den Netto-Pfeil: leicht wackelige Kante
            (Displacement) + feine Grafit-Körnung (Deckkraft-Rauschen). Einmal
            definiert, von allen Zeilen-SVGs via filter="url(#net-pencil)"
            referenziert. */}
        <svg width="0" height="0" className="absolute" aria-hidden>
          <defs>
            <filter
              id="net-pencil"
              x="-30%"
              y="-150%"
              width="160%"
              height="400%"
              colorInterpolationFilters="sRGB"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.045 0.10"
                numOctaves={2}
                seed={6}
                result="wob"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="wob"
                scale={1.6}
                xChannelSelector="R"
                yChannelSelector="G"
                result="rough"
              />
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.7"
                numOctaves={2}
                seed={11}
                result="grain"
              />
              <feColorMatrix
                in="grain"
                type="matrix"
                values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.7 0.45"
                result="grainA"
              />
              <feComposite in="rough" in2="grainA" operator="in" />
            </filter>
          </defs>
        </svg>

        {/* Eyebrow */}
        <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t("arrowsEyebrow")} · {rows.length} {t("cloudThemes")}
        </p>
        {/* Serifen-Titel */}
        <p
          className="mb-1.5 text-[1.5rem] leading-tight tracking-tight text-foreground"
          style={SERIF}
        >
          {t("arrowsTitle")}
        </p>
        <p className="mb-4 text-[13.5px] leading-relaxed text-muted-foreground">
          {t("arrowsSubtitle")}
        </p>

        {/* relative Hülle: die 0-Achse liegt als EINE durchgehende Linie über
            allen Zeilen (statt pro Zeile unterbrochen). */}
        <div className="relative">
          {/* Stille Skala: durchgängige gepunktete Hilfslinien als Ebene HINTER
              allen Zeilen (Zeilen-SVGs sind transparent ⇒ Linien bleiben hinter
              den Pfeilen sichtbar). preserveAspectRatio="none" streckt die feste
              viewBox-Höhe 100 auf die volle Plot-Höhe. */}
          <div
            className={`${rowGrid} pointer-events-none absolute inset-0`}
            aria-hidden
          >
            <span />
            <svg
              viewBox={`0 0 ${VW} 100`}
              preserveAspectRatio="none"
              className="h-full w-full"
            >
              {scaleLines()}
            </svg>
            <span />
          </div>

          <div className="relative flex flex-col gap-2">
            {rows.map(({ node, n, P, K, tendency }) => {
              const kind = classifyKind(P, K, n);
              // Nur eine klare Richtung färbt das Badge; ambivalent/ausgeglichen neutral.
              const badge = kind === "yes" ? POS : kind === "no" ? NEG : ZERO;
              const clickable = !!node.key && !!onSelect;
              return (
                <div
                  key={node.id}
                  className={`${rowGrid}${clickable ? " group -mx-2 cursor-pointer rounded-lg px-2 transition hover:bg-foreground/[0.035] focus-visible:bg-foreground/[0.035] focus-visible:outline-none" : ""}`}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  aria-label={clickable ? node.name : undefined}
                  onClick={clickable ? () => onSelect!(node.key!) : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSelect!(node.key!);
                          }
                        }
                      : undefined
                  }
                >
                  <span
                    className={`text-right text-[15px] leading-snug text-foreground/85${clickable ? " underline-offset-2 group-hover:text-foreground group-hover:underline" : ""}`}
                    style={SERIF}
                    title={node.name}
                  >
                    {node.name}
                  </span>

                  <svg
                    viewBox={`0 0 ${VW} ${VH}`}
                    className="block h-auto w-full"
                    role="img"
                    aria-label={`${node.name} · für Ja ${Math.round(P * 100)} · für Nein ${Math.round(K * 100)} · ${signed(tendency)}`}
                  >
                    {/* Kräfteebene: zwei sehr blasse, gleich breite Hintergrund-
                      pfeile — Kontra (links, korallen, Länge K) + Pro (rechts,
                      navy, Länge P). Gegenläufig ⇒ Ambivalenz wird sichtbar. */}
                    {n > 0 && renderArrow(K * ARM_SPAN, -1, ARM_NO, RAW_ARROW)}
                    {n > 0 && renderArrow(P * ARM_SPAN, 1, ARM_YES, RAW_ARROW)}

                    {/* Netto-Zeichen: dunkle Bubble an der Netto-Position
                      (Schwerpunkt der beiden Vektoren) — kein Netto-Pfeil/-Balken
                      mehr. */}
                    {n > 0 && renderBubble(tendency, Math.max(P, K), kind)}
                  </svg>

                  <span
                    className="justify-self-end text-right text-[11px] font-semibold uppercase leading-tight tracking-[0.04em]"
                    style={{ color: badge.fg }}
                    title={n === 0 ? t("unrated") : signed(tendency)}
                  >
                    {n === 0 ? "—" : kindLabel(t, kind, tendency)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* durchgehende 0-Achse über alle Zeilen — exakt in der Mitte der
              1fr-Spalte (deckt sich mit XC der Zeilen-SVGs). */}
          <div
            className={`${rowGrid} pointer-events-none absolute inset-0`}
            aria-hidden
          >
            <span />
            <span className="mx-auto h-full w-px bg-[var(--line-mid,rgba(0,0,0,0.18))]" />
            <span />
          </div>
        </div>

        {/* Stille Zahlenskala — Prozent der Armlänge, beidseitig (0/50/100). */}
        <div className={`${rowGrid} mt-1.5`} aria-hidden>
          <span />
          <svg
            viewBox={`0 0 ${VW} 12`}
            className="block h-auto w-full overflow-visible"
          >
            <text
              x={XC}
              y={9}
              textAnchor="middle"
              fontSize={8.5}
              fill="var(--muted-foreground)"
              className="tabular-nums"
            >
              0
            </text>
            {SCALE_LABELED.flatMap((f) =>
              ([1, -1] as const).map((dir) => (
                <text
                  key={`num-${f}-${dir}`}
                  x={XC + dir * f * ARM_SPAN}
                  y={9}
                  textAnchor="middle"
                  fontSize={8.5}
                  fill="var(--muted-foreground)"
                  className="tabular-nums"
                >
                  {Math.round(f * 100)}
                </text>
              )),
            )}
          </svg>
          <span />
        </div>

        {/* Pol-Beschriftung an der 0-Achse: ← spricht für ein Nein | für ein Ja → */}
        <div className={`${rowGrid} mt-2`}>
          <span />
          <div className="flex text-[11px] font-semibold uppercase tracking-[0.1em]">
            <span className="flex-1 pr-2 text-right" style={{ color: NEG.fg }}>
              ← {t("cloudArmNo")}
            </span>
            <span className="flex-1 pl-2 text-left" style={{ color: POS.fg }}>
              {t("cloudArmYes")} →
            </span>
          </div>
          <span />
        </div>
      </CardContent>
    </Card>
  );
}

export default TaxonomyArrows;
