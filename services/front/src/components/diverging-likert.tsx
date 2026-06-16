"use client";

/**
 * Soft-OR-Balken je Thema (zwei Arme). Jede Zeile ist ein Thema: links das Label,
 * in der Mitte der Balken, rechts ein Badge.
 *
 * Der Balken hat einen festen Nullpunkt in der Mitte (neutral); von dort wachsen
 * zwei Arme in entgegengesetzte Richtungen:
 *   • korallener Arm nach LINKS  = „spricht für ein Nein" (Kontra-Argumente)
 *   • blauer Arm nach RECHTS     = „spricht für ein Ja"  (Pro-Argumente)
 *
 * Armlängen: Pro- und Kontra-Argumente liegen in zwei getrennten Töpfen (Bewertung
 * 0–100 „wie stark spricht dieses Argument dafür"). Jeder Topf wird per Soft-OR
 * (Noisy-OR mit γ, siehe lib/aggregate.ts) zu einer Zahl verdichtet: P (Ja) → blauer
 * Arm, K (Nein) → korallener Arm, beide ∈ [0,1]. Jeder Arm ist ein durchgehender
 * Balken (keine sichtbare Unterteilung); die einzelnen Argumente leben nur noch als
 * Tooltip-Segmente weiter. Eine Farbe je Seite, keine Stark/Schwach-Abstufung.
 *
 * Badge rechts = Tendenz = P − K (z. B. „+45" = lehnt um 45 Punkte Richtung Ja).
 *
 * Lesart: längerer Arm = Richtung; beide lang = umkämpft; beide kurz = indifferent;
 * lang + Stummel = klar einseitig.
 */
import { useMemo, type ReactNode } from "react";
import type { TaxonomyNode } from "@/types/ballots";
import { Card, CardContent } from "@/components/ui/card";
import { collectLeaningContribs, noisyOrBites } from "@/lib/aggregate";
import {
  ARM_NO_CSS as ARM_NO,
  ARM_YES_CSS as ARM_YES,
  TRACK_CSS as TRACK,
} from "@/lib/chart-palette";

type T = (key: string) => string;

const SERIF = {
  fontFamily: 'var(--font-serif), Georgia, "Times New Roman", serif',
} as const;

// Pole + Schiene (Track) kommen aus der geteilten Palette (chart-palette.ts):
// korallen = Nein (links), navy = Ja (rechts), warmes Hellgrau = Schiene. So
// teilen Balken und Sunburst exakt dieselben Endpunkte/Nullpunkt.

// Tendenz-Badge: blau getönt Richtung Ja, korallen Richtung Nein.
const POS = { bg: "rgba(60, 90, 143, 0.12)", fg: "rgb(56, 84, 134)" };
const NEG = { bg: "rgba(202, 112, 88, 0.16)", fg: "rgb(166, 78, 54)" };
const ZERO = { bg: "rgba(0,0,0,0.05)", fg: "var(--muted-foreground)" };

/* ---------- Achsen-Geometrie (viewBox-Breite 600) ---------- */
const VW = 600;
const PAD = 10;
const X0 = PAD;
const X1 = VW - PAD;
const XC = (X0 + X1) / 2; // neutrale Mitte (fester Nullpunkt)
const HALF = (X1 - X0) / 2;
const BARH = 30;
const TRACK_Y = 3;
const TRACK_H = 24;
const BAR_Y = 6;
const BAR_H = 18;
const CGAP = 3; // Lücke je Seite an der Mitte (für die Mittellinie)
const ARM_SPAN = HALF - CGAP; // px-Länge eines Arms bei Score = 1

// −/+ mit echtem Minuszeichen, z. B. „+46", „−28". v ∈ [−1,1] → Prozentpunkte.
function signed(v: number): string {
  const n = Math.round(v * 100);
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return "0";
}

type Bite = { mag: number; bite: number };
type Row = {
  node: TaxonomyNode;
  n: number;
  P: number; // Soft-OR Pro (Ja) ∈ [0,1]
  K: number; // Soft-OR Kontra (Nein) ∈ [0,1]
  tendency: number; // P − K ∈ [−1,1]
  pro: Bite[];
  kon: Bite[];
};

// Ein Arm: gerundeter, durchgehender Balken ab der Mitte nach `dir` (+1 rechts /
// −1 links). EINE volle Fläche (kein Aneinanderreihen gleichfarbiger Rechtecke —
// das erzeugte feine Anti-Aliasing-Nähte an den Stossstellen). Die einzelnen
// Argumente leben nur noch als unsichtbare Hover-Flächen für die Tooltips weiter.
function renderArm(bites: Bite[], dir: 1 | -1, color: string, clipId: string): ReactNode {
  const span = bites.reduce((a, b) => a + b.bite, 0);
  if (span < 0.002) return null;
  const armLen = span * ARM_SPAN;
  const innerX = XC + dir * CGAP;
  const clipX = dir === 1 ? innerX : innerX - armLen;

  // Durchsichtige Hover-Flächen je Argument (nur für die <title>-Tooltips).
  const hits: ReactNode[] = [];
  let cum = 0;
  bites.forEach((b, i) => {
    const a = innerX + dir * cum * ARM_SPAN;
    cum += b.bite;
    const c = innerX + dir * cum * ARM_SPAN;
    hits.push(
      <rect
        key={`h${i}`}
        x={Math.min(a, c)}
        y={BAR_Y}
        width={Math.abs(c - a)}
        height={BAR_H}
        fill="transparent"
      >
        <title>{`${Math.round(b.mag * 100)}/100`}</title>
      </rect>,
    );
  });

  return (
    <g key={clipId}>
      <defs>
        <clipPath id={clipId}>
          <rect x={clipX} y={BAR_Y} width={armLen} height={BAR_H} rx={BAR_H / 2} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {/* Eine durchgehende Füllung — keine sichtbaren Stossstellen. */}
        <rect x={clipX} y={BAR_Y} width={armLen} height={BAR_H} fill={color} />
        {hits}
      </g>
    </g>
  );
}

export function DivergingLikert({
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
      // Zwei Töpfe: Pro (c>0) und Kontra (c<0, Betrag), je per Soft-OR verdichtet.
      const pro = noisyOrBites(cs.filter((c) => c > 0));
      const kon = noisyOrBites(cs.filter((c) => c < 0).map((c) => -c));
      const P = pro.reduce((a, b) => a + b.bite, 0);
      const K = kon.reduce((a, b) => a + b.bite, 0);
      return { node, n: cs.length, P, K, tendency: P - K, pro, kon };
    });
    // Leaderboard: nach Tendenz (P − K); unbewertete ans Ende.
    return built.sort((a, b) => {
      if (a.n === 0 || b.n === 0) return a.n === 0 ? (b.n === 0 ? 0 : 1) : -1;
      return b.tendency - a.tendency;
    });
  }, [nodes]);

  if (!nodes.length) return null;

  // Feste (inhaltsunabhängige) Label- und Badge-Spalten, damit die mittlere
  // 1fr-Spalte in ALLEN Zeilen exakt gleich breit/positioniert ist — sonst läge
  // die Balken-Mitte nicht unter der Mitte der Pol-Beschriftung (auto-Spalten
  // kollabieren in der Achsen-Zeile auf 0). clamp() ist responsiv, aber je
  // Zeile identisch (relativ zur Grid-Breite, nicht zum Inhalt).
  const rowGrid =
    "grid grid-cols-[clamp(140px,32%,230px)_1fr_3.75rem] items-center gap-4";

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
        <p className="mb-4 text-[13.5px] leading-relaxed text-muted-foreground">
          {t("cloudSubtitle")}
        </p>

        <div className="flex flex-col gap-2">
          {rows.map(({ node, n, P, K, tendency, pro, kon }) => {
            const badge =
              n === 0 ? ZERO : tendency > 0 ? POS : tendency < 0 ? NEG : ZERO;
            const base = `arm-${node.id}`;
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
                  viewBox={`0 0 ${VW} ${BARH}`}
                  className="block h-auto w-full"
                  role="img"
                  aria-label={`${node.name} · für Ja ${Math.round(P * 100)} · für Nein ${Math.round(K * 100)} · ${signed(tendency)}`}
                >
                  {/* Schiene. Unbewertet (n === 0) ⇒ gestrichelter, „provisorischer"
                      Rand auf der leeren Schiene — identisch zu den unbewerteten
                      Segmenten im Sunburst. */}
                  <rect
                    x={X0}
                    y={TRACK_Y}
                    width={X1 - X0}
                    height={TRACK_H}
                    rx={TRACK_H / 2}
                    fill={TRACK}
                    stroke={n === 0 ? "rgba(0,0,0,0.2)" : "none"}
                    strokeWidth={n === 0 ? 1 : 0}
                    strokeDasharray={n === 0 ? "3 2.5" : undefined}
                  />
                  {/* Arme: Kontra (links, korallen) + Pro (rechts, blau) */}
                  {renderArm(kon, -1, ARM_NO, `${base}-no`)}
                  {renderArm(pro, 1, ARM_YES, `${base}-yes`)}

                  {/* feine Mittellinie — fester Nullpunkt (neutral) */}
                  <line
                    x1={XC}
                    y1={2}
                    x2={XC}
                    y2={BARH - 2}
                    stroke="var(--line-mid)"
                    strokeWidth={1}
                    strokeOpacity={0.7}
                  />
                </svg>

                <span
                  className="justify-self-end rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums"
                  style={{ background: badge.bg, color: badge.fg }}
                  title={n === 0 ? t("unrated") : undefined}
                >
                  {n === 0 ? "—" : signed(tendency)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Pol-Beschriftung am Nullpunkt: ← mehr Nein | mehr Ja → (mittig flankierend) */}
        <div className={`${rowGrid} mt-3`}>
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

export default DivergingLikert;
