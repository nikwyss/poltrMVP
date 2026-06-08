"use client";

/**
 * Taxonomie-Sunburst — die Themen-Hierarchie als konzentrische Ringe (Zentrum =
 * Ballot, Ring 1 = Hauptthemen, weitere Ringe = Subthemen). Ergänzt das
 * Positionsband um die ganze Tiefe der Hierarchie auf einen Blick.
 *
 * Farbe = `proLeaning` ∈ [-1,1] des Viewers (relevanz-gewichtete Pro-Vorlage-
 * Neigung) als kontinuierliche diverging-Skala: rot (auf Gegner-Seite) → grau
 * (neutral) → blau (auf Befürworter-Seite). Unbewertet/ohne Login = weiss
 * (mit feinem Umriss). Stark gespaltene Knoten (`dissent`) bekommen einen
 * Amber-Rand — sie sind nicht indifferent, sondern hin- und hergerissen.
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


// dissent darüber ⇒ Knoten gilt als „gespalten" und bekommt den Amber-Rand.
const SPLIT_THRESHOLD = 0.5;

// Pole — konsistent mit Positionsband / Insight.
const RED: [number, number, number] = [178, 58, 33]; // Gegner-Seite
const BLUE: [number, number, number] = [37, 99, 235]; // Befürworter-Seite
const MID: [number, number, number] = [233, 230, 224]; // neutrale Mitte (warmes Grau)
const AMBER = "rgb(217, 159, 40)"; // Rand für stark gespaltene Knoten (dissent)

// Entsättigung: jeder bewertete Ton wird Richtung Hellgrau gemischt, damit die
// kräftigen Pole weicher wirken. Unbewertete Segmente gehen auf sehr helles Grau
// und treten so klar hinter die bewerteten zurück.
const DESAT: [number, number, number] = [244, 244, 245]; // #f4f4f5 (zinc-100)
const DESAT_T = 0.28; // ~28 % Richtung Hellgrau
const UNRATED: [number, number, number] = [255, 255, 255]; // unbewertet = weiss (mit feinem Umriss)

// Geometrie
const SIZE = 420;
const CX = SIZE / 2;
const CY = SIZE / 2;
const CENTER_R = 30; // Radius der Zentrumsscheibe (kleines Loch → mehr Ringfläche)
const OUTER_R = 206; // äusserster Radius (fast bis an den Rand → mehr Textplatz)
const LABEL_MIN_ANGLE = 9; // ° — schmaler ⇒ kein Label (nur Tooltip)
const LABEL_R_FRAC = 0.62; // Label-Position im Ring: >0.5 ⇒ nach aussen (mehr Bogenlänge)
const CORNER_R = 4; // abgerundete Segment-Ecken
const PAD_DEG = 1.4; // ° Luft zwischen Segmenten (statt Trennlinien)
const OUTER_OPACITY = 0.62; // Deckkraft des äussersten Rings (innen = 1)
const MAX_LEVELS = 3; // nie mehr als 3 Ringe zeichnen (4. Ebene wird weggelassen)
const THIRD_RING_WIDTH = 16; // 3. Ring nur als dünnes Band; Ebene 1 & 2 teilen den Rest

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function mixT(
  c1: [number, number, number],
  c2: [number, number, number],
  t: number,
): [number, number, number] {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

function rgb(c: [number, number, number]): string {
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

// proLeaning -1..1 → diverging rot↔neutral↔blau, entsättigt; null = helles Grau.
function fillFor(lean: number | null | undefined): string {
  if (lean == null) return rgb(UNRATED);
  const base =
    lean >= 0 ? mixT(MID, BLUE, Math.min(1, lean)) : mixT(MID, RED, Math.min(1, -lean));
  return rgb(mixT(base, DESAT, DESAT_T));
}

// proLeaning -1..1 → i18n-Key der 5-stufigen Ja↔Nein-Position (Zentrums-Label).
// Symmetrisch um 0; spiegelt die Legende „Näher bei den Ja/Nein-Argumenten".
function leaningKey(lean: number | null | undefined): string {
  if (lean == null) return "sunburstLeanUnrated";
  if (lean <= -0.5) return "sunburstLeanStrongNo";
  if (lean <= -0.15) return "sunburstLeanNo";
  if (lean < 0.15) return "sunburstLeanBalanced";
  if (lean < 0.5) return "sunburstLeanYes";
  return "sunburstLeanStrongYes";
}

// Dunkle Töne aus derselben Farbfamilie wie die Füllung — für Label-Text ohne
// harten Weiss-Kontrast / Halo.
const DARK_BLUE: [number, number, number] = [28, 52, 120]; // dunkles Blau
const DARK_RED: [number, number, number] = [112, 34, 20]; // dunkles Rot
const DARK_NEUTRAL: [number, number, number] = [88, 86, 92]; // mittleres Grau

// Label-Farbe = dunkle Variante der Segment-Hue: blau→dunkelblau, rot→dunkelrot,
// neutral→mittelgrau. Schwache Neigung mischt Richtung Grau (folgt der Füllung).
function textColor(lean: number | null | undefined): string {
  if (lean == null) return rgb(DARK_NEUTRAL);
  const strength = Math.min(1, Math.abs(lean));
  const dark = lean >= 0 ? DARK_BLUE : DARK_RED;
  return rgb(mixT(DARK_NEUTRAL, dark, strength));
}

// Label an Wortgrenzen auf bis zu maxLines Zeilen umbrechen; Überlauf mit „…".
function wrapLabel(name: string, maxChars: number, maxLines: number): string[] {
  const words = name.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (!cur || candidate.length <= maxChars || lines.length >= maxLines - 1) {
      cur = candidate; // erstes Wort, passt, oder letzte erlaubte Zeile (wird ggf. gekürzt)
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.map((l) =>
    l.length > maxChars ? `${l.slice(0, Math.max(1, maxChars - 1))}…` : l,
  );
}

function polar(r: number, angleDeg: number): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

// Ringsegment als Pfad. Mit abgerundeten Ecken (cr): an jeder der vier Ecken
// wird die scharfe Spitze durch einen kleinen Bogen ersetzt — clamped auf die
// radiale Dicke und die Winkelbreite, damit schmale Segmente nicht kollabieren.
function arcPath(
  rInner: number,
  rOuter: number,
  a0: number,
  a1: number,
  cr: number = CORNER_R,
): string {
  const spanDeg = a1 - a0;
  if (spanDeg <= 0) return "";
  const sharp = () => {
    const large = spanDeg > 180 ? 1 : 0;
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
  };
  // Eckradius auf radiale Dicke und (halbe) Bogenlänge je Radius begrenzen.
  const halfSpanRad = ((spanDeg / 2) * Math.PI) / 180;
  const r = Math.min(cr, (rOuter - rInner) / 2, halfSpanRad * rInner, halfSpanRad * rOuter);
  if (r < 0.75) return sharp();

  const degO = ((r / rOuter) * 180) / Math.PI; // Winkel-Inset auf Aussenbogen
  const degI = ((r / rInner) * 180) / Math.PI; // Winkel-Inset auf Innenbogen
  const largeO = spanDeg - 2 * degO > 180 ? 1 : 0;
  const largeI = spanDeg - 2 * degI > 180 ? 1 : 0;

  const p1 = polar(rOuter, a0 + degO); // Aussenbogen Start
  const p2 = polar(rOuter, a1 - degO); // Aussenbogen Ende
  const p3 = polar(rOuter - r, a1); // Radialkante a1 (aussen)
  const p4 = polar(rInner + r, a1); // Radialkante a1 (innen)
  const p5 = polar(rInner, a1 - degI); // Innenbogen Start
  const p6 = polar(rInner, a0 + degI); // Innenbogen Ende
  const p7 = polar(rInner + r, a0); // Radialkante a0 (innen)
  const p8 = polar(rOuter - r, a0); // Radialkante a0 (aussen)
  return [
    `M ${p1[0]} ${p1[1]}`,
    `A ${rOuter} ${rOuter} 0 ${largeO} 1 ${p2[0]} ${p2[1]}`,
    `A ${r} ${r} 0 0 1 ${p3[0]} ${p3[1]}`,
    `L ${p4[0]} ${p4[1]}`,
    `A ${r} ${r} 0 0 1 ${p5[0]} ${p5[1]}`,
    `A ${rInner} ${rInner} 0 ${largeI} 0 ${p6[0]} ${p6[1]}`,
    `A ${r} ${r} 0 0 1 ${p7[0]} ${p7[1]}`,
    `L ${p8[0]} ${p8[1]}`,
    `A ${r} ${r} 0 0 1 ${p1[0]} ${p1[1]}`,
    "Z",
  ].join(" ");
}

// Bogen-Mittellinie als Pfad für gekrümmten Text (<textPath>). Untere Hälfte
// umgekehrt zeichnen, damit der Text aufrecht statt kopfüber steht.
function textArcPath(r: number, a0: number, a1: number, flip: boolean): string {
  const [s0, s1] = flip ? [a1, a0] : [a0, a1];
  const [xs, ys] = polar(r, s0);
  const [xe, ye] = polar(r, s1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = flip ? 0 : 1;
  return `M ${xs} ${ys} A ${r} ${r} 0 ${large} ${sweep} ${xe} ${ye}`;
}

interface Seg {
  node: TaxonomyNode;
  level: number; // 1 = innerster Ring
  a0: number;
  a1: number;
}

// Equal-share-Layout: jedes Geschwister bekommt denselben Winkelanteil.
// Nur bis MAX_LEVELS Ebenen — tiefere Ebenen werden gar nicht erfasst/gezeichnet.
function layout(root: TaxonomyNode): { segs: Seg[]; maxLevel: number } {
  const segs: Seg[] = [];
  let maxLevel = 0;
  const walk = (node: TaxonomyNode, level: number, a0: number, a1: number) => {
    if (level >= 1) {
      segs.push({ node, level, a0, a1 });
      if (level > maxLevel) maxLevel = level;
    }
    if (level >= MAX_LEVELS) return; // 4. Ebene nie zeichnen
    const kids = node.children ?? [];
    if (!kids.length) return;
    const step = (a1 - a0) / kids.length;
    kids.forEach((c, i) => walk(c, level + 1, a0 + i * step, a0 + (i + 1) * step));
  };
  walk(root, 0, 0, 360);
  return { segs, maxLevel };
}

// Ring-Grenzradien je Ebenenzahl. Bei 3 Ebenen bekommt der äusserste Ring nur
// THIRD_RING_WIDTH (dünnes Band); Ebene 1 & 2 teilen den verbleibenden Platz.
// Rückgabe: radii[level-1]..radii[level] = [Innen, Aussen] des Rings `level`.
function ringRadii(levels: number): number[] {
  if (levels <= 1) return [CENTER_R, OUTER_R];
  if (levels === 2) {
    const step = (OUTER_R - CENTER_R) / 2;
    return [CENTER_R, CENTER_R + step, OUTER_R];
  }
  const inner = OUTER_R - THIRD_RING_WIDTH; // Beginn des dünnen 3. Rings
  const step = (inner - CENTER_R) / 2;
  return [CENTER_R, CENTER_R + step, inner, OUTER_R];
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

  const { segs, radii, maxLevel } = useMemo(() => {
    const { segs, maxLevel } = layout(root);
    const radii = ringRadii(maxLevel);
    return { segs, radii, maxLevel };
  }, [root]);

  if (!segs.length) return null;

  // Einebenig (nur Top-Topics) ⇒ grössere Labels, da der eine Ring sehr dick ist;
  // ab zwei Ebenen kompakt. (Per-Segment skaliert die 2. Ebene zusätzlich runter.)
  const labelFont = maxLevel <= 1 ? 13 : 10;
  // Chart-Breite: einebenig wie früher, mehrebenig moderat grösser (nicht voll).
  const chartMaxW = maxLevel <= 1 ? 580 : 680;

  // Standardmässig kein Panel; nur beim Hover erscheint Titel + Bewertung seitlich.
  const active = hover;
  const lean = active?.proLeaning;
  const ratingLabel = active ? t(leaningKey(lean)) : "";
  // Farbe = Seite (blau/rot), abgedunkelt für Lesbarkeit; Stufe sagt der Text.
  const ratingColor =
    lean == null ? "rgba(0,0,0,0.5)" : rgb(mixT(lean >= 0 ? BLUE : RED, [30, 30, 30], 0.15));
  // Gespalten (hoher dissent) ⇒ Amber-Hinweis im Panel, passend zum Amber-Rand.
  const activeSplit = !!active && (active.dissent ?? 0) > SPLIT_THRESHOLD;
  // Panel auf die dem Segment gegenüberliegende Seite legen (Winkel 0–180 = rechte
  // Hälfte → Panel links, sonst rechts), damit es das aktive Segment nicht verdeckt.
  const activeSeg = active ? segs.find((s) => s.node === active) : undefined;
  const activeMid = activeSeg ? (activeSeg.a0 + activeSeg.a1) / 2 : 0;
  const panelSide = activeMid > 0 && activeMid < 180 ? "left" : "right";

  return (
    <Card className="border-black/5">
      <CardContent className="pt-6">
        <p className="mb-0.5 text-sm font-medium text-foreground/90">{t("sunburstTitle")}</p>
        <p className="mb-3 text-[13px] leading-snug text-muted-foreground">
          {t("sunburstSubtitle")}
        </p>

        <div className="relative mx-auto w-full" style={{ maxWidth: chartMaxW }}>
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="h-auto w-full"
            role="img"
            aria-label={t("sunburstTitle")}
          >
            {segs.map((s) => {
              const rInner = radii[s.level - 1];
              const rOuter = radii[s.level];
              const thickness = rOuter - rInner; // Ringdicke (3. Ring ist dünn)
              const span = s.a1 - s.a0;
              // Luft zwischen Segmenten: Winkel beidseitig einschrumpfen
              // (höchstens ~⅓ der Breite, damit schmale Segmente bestehen bleiben).
              const pad = Math.min(PAD_DEG, span * 0.35) / 2;
              const pa0 = s.a0 + pad;
              const pa1 = s.a1 - pad;
              // Tiefenstaffelung: innen voll deckend, aussen Richtung OUTER_OPACITY.
              const depthT = maxLevel > 1 ? (s.level - 1) / (maxLevel - 1) : 0;
              const baseOpacity = 1 - depthT * (1 - OUTER_OPACITY);
              const unrated = s.node.proLeaning == null; // weiss ⇒ feiner Umriss nötig
              // „Gespalten": Ja- UND Nein-Argumente stark bewertet ⇒ Durchschnitt
              // neutral, aber inhaltlich Spannungsthema. Amber-Rand hebt das hervor.
              const split = (s.node.dissent ?? 0) > SPLIT_THRESHOLD;
              const clickable = !!s.node.key && !!onSelect;
              const mid = (s.a0 + s.a1) / 2;
              // Innerster Ring: Text gekrümmt entlang des Bogens; tiefere Ringe radial.
              const curved = s.level === 1;
              // 2.+ Ebene (radiale Labels) eine Spur kleiner als die Top-Topics.
              const segFont = curved ? labelFont : Math.max(8, labelFont - 1);
              const segScale = segFont / 10;
              // Gekrümmte Labels nach aussen rücken (mehr Bogenlänge). Radiale Labels
              // mittig lassen — dort begrenzt die Ringdicke (symmetrisch) die Länge.
              const labelR = rInner + (rOuter - rInner) * (curved ? LABEL_R_FRAC : 0.5);
              const [lx, ly] = polar(labelR, mid);
              // Dünne Ringe (z. B. der 3.) bekommen kein Label — nur Farbe.
              const showLabel = span >= LABEL_MIN_ANGLE && thickness > 22;
              // Radiale Ausrichtung (tiefere Ringe): tangential gedreht, links gespiegelt.
              let rot = mid - 90;
              if (mid > 180) rot += 180;
              // Untere Hälfte: Text-Pfad umkehren, sonst stünde der Text kopfüber.
              const flip = mid > 90 && mid < 270;
              // Zeichenkapazität pro Zeile: gekrümmt entlang des Bogens, radial entlang
              // der Ringdicke (dort schnitt die alte Bogen-Formel zu früh ab).
              const maxChars = curved
                ? Math.max(3, Math.floor((span / 360) * 2 * Math.PI * labelR / (6.5 * segScale)))
                : Math.max(4, Math.floor((thickness - 6) / (5.8 * segScale)));
              // Top-Topics (innerster Ring) bis zu 3 Zeilen — dort ist am meisten
              // Platz, so passen die vollen Namen. Tiefere Ringe max. 2 bzw. 1.
              const maxLines = curved ? (thickness >= 30 ? 3 : 2) : thickness >= 28 ? 2 : 1;
              const lines = wrapLabel(s.node.name, maxChars, maxLines);
              return (
                <g key={`${s.node.id}-${s.level}`}>
                  <path
                    d={arcPath(rInner, rOuter, pa0, pa1)}
                    fill={fillFor(s.node.proLeaning)}
                    stroke={split ? AMBER : unrated ? "rgba(0,0,0,0.12)" : "none"}
                    strokeWidth={split ? 2.5 : unrated ? 1 : 0}
                    style={{
                      cursor: clickable ? "pointer" : "default",
                      opacity: (hover && hover !== s.node ? 0.82 : 1) * baseOpacity,
                      transition: "opacity 120ms",
                    }}
                    onMouseEnter={() => setHover(s.node)}
                    onMouseLeave={() => setHover((h) => (h === s.node ? null : h))}
                    onClick={() => clickable && onSelect!(s.node.key!)}
                  />
                  {showLabel &&
                    curved &&
                    lines.map((line, i) => {
                      const n = lines.length;
                      // Mehrzeilig: Zeilen radial um die Ring-Mittellinie verteilen.
                      const ri = labelR + (flip ? -1 : 1) * ((n - 1) / 2 - i) * (11 * segScale);
                      const pid = `lp-${s.node.id}-${s.level}-${i}`;
                      return (
                        <g key={pid}>
                          <path id={pid} d={textArcPath(ri, s.a0, s.a1, flip)} fill="none" />
                          <text
                            fill={textColor(s.node.proLeaning)}
                            fontSize={segFont}
                            style={{ pointerEvents: "none", userSelect: "none" }}
                          >
                            <textPath href={`#${pid}`} startOffset="50%" textAnchor="middle">
                              {line}
                            </textPath>
                          </text>
                        </g>
                      );
                    })}
                  {showLabel && !curved && (
                    <text
                      x={lx}
                      y={ly}
                      fill={textColor(s.node.proLeaning)}
                      fontSize={segFont}
                      textAnchor="middle"
                      dominantBaseline="central"
                      transform={`rotate(${rot} ${lx} ${ly})`}
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {lines.map((line, i) => (
                        <tspan
                          key={`${i}-${line}`}
                          x={lx}
                          dy={i === 0 ? `${-(lines.length - 1) * 0.55}em` : "1.1em"}
                        >
                          {line}
                        </tspan>
                      ))}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Zentrumsscheibe — nimmt die Hintergrundfarbe an, damit der Ring
                schwebt statt auf einer Scheibe zu kleben. */}
            <circle cx={CX} cy={CY} r={CENTER_R} fill="var(--card)" stroke="rgba(0,0,0,0.05)" />
          </svg>

          {/* Hover-Panel: seitlich (gegenüber dem aktiven Segment) statt in der
              Mitte — mit Hintergrund + Rand. pointer-events: none, damit das
              Segment darunter weiter gehovert werden kann. */}
          {active && (
            <div
              className="pointer-events-none absolute top-1/2 z-10 max-w-[44%] -translate-y-1/2"
              style={panelSide === "left" ? { left: "2%" } : { right: "2%" }}
            >
              <div className="rounded-xl border border-black/10 bg-card/95 px-3 py-2 shadow-lg backdrop-blur-sm">
                <p className="text-sm font-medium leading-snug text-foreground/90">
                  {active.name}
                </p>
                <p
                  className="mt-0.5 text-xs font-semibold leading-snug"
                  style={{ color: ratingColor }}
                >
                  {ratingLabel}
                </p>
                {activeSplit && (
                  <p
                    className="mt-1 flex items-center gap-1.5 text-xs font-medium leading-snug"
                    style={{ color: AMBER }}
                  >
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ background: AMBER }}
                    />
                    {t("sunburstDissentNote")}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Legende: Pole wie im Positionsband — unterhalb des Charts */}
        <div className="mt-3 flex items-center justify-center gap-3 text-[13px] font-medium">
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

        {/* Zweite Zeile: Sonder-Marker als kleine Ringsegmente in Sektorform —
            weiss = unbewertet, neutral mit Amber-Rand = gespalten. */}
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <svg viewBox="2 2.7 16 8" className="h-3.5 w-7 shrink-0" aria-hidden="true">
              <path
                d="M 4.84 4.63 A 9 9 0 0 1 15.16 4.63 L 12.29 8.72 A 4 4 0 0 0 7.71 8.72 Z"
                fill={fillFor(null)}
                stroke="rgba(0,0,0,0.12)"
                strokeWidth={1.2}
                strokeLinejoin="round"
              />
            </svg>
            {t("sunburstLeanUnrated")}
          </span>
          <span className="flex items-center gap-1.5">
            <svg viewBox="2 2.7 16 8" className="h-3.5 w-7 shrink-0" aria-hidden="true">
              <path
                d="M 4.84 4.63 A 9 9 0 0 1 15.16 4.63 L 12.29 8.72 A 4 4 0 0 0 7.71 8.72 Z"
                fill={fillFor(0)}
                stroke={AMBER}
                strokeWidth={1.6}
                strokeLinejoin="round"
              />
            </svg>
            {t("sunburstDissentNote")}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default TaxonomySunburst;
