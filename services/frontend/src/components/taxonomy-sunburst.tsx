"use client";

/**
 * Taxonomie-Sunburst — die Themen-Hierarchie als konzentrische Ringe (Zentrum =
 * Ballot, Ring 1 = Hauptthemen, weitere Ringe = Subthemen). Ergänzt das
 * Positionsband um die ganze Tiefe der Hierarchie auf einen Blick.
 *
 * Farbe = aggregierte Haltung ∈ [-1,1] des Viewers (zentrale Aggregierung, siehe
 * lib/aggregate.ts + doc/AGGREGATION.md) auf der GETEILTEN diverging-Skala aus
 * lib/chart-palette.ts — Koralle (Gegner-Seite) ↔ TRACK (neutral) ↔ Navy
 * (Befürworter-Seite), volltonig (keine Tiefen-Transparenz; Unterthemen sind so
 * kräftig wie die Oberthemen). Endpunkte und Nullpunkt sind identisch mit den
 * Likert-Balken-Armen. Kein Track-Ring: die Hierarchie tragen die hellen
 * var(--card)-Separatoren zwischen den Segmenten plus die radialen RING_GAP-Lücken
 * zwischen den Ebenen. Unbewertet/ohne Login = transparentes Segment mit feinem
 * gestricheltem Umriss (wie ein leerer Track-Abschnitt der Balken). Stark
 * gespaltene Knoten (hoher `dissent`) bekommen einen Amber-Rand — sie sind nicht
 * indifferent, sondern hin- und hergerissen.
 *
 * Layout (Drei-Block): Die Oberthemen (Ring 1) werden nach aggregierter Haltung in
 * drei Blöcke gruppiert — Nein (links), Neutral (oben), Ja (rechts) — getrennt
 * durch breite Inter-Block-Lücken (BLOCK_GAP_DEG). Das spiegelt die Nein←→Ja-Achse
 * der Likert-Balken. Alle Themen sind gleich breit (Argument-Volumen spielt keine
 * Rolle); ein Block ist so breit wie seine Anzahl Themen. Unterthemen erben den
 * Winkelbereich (und damit den Block) ihres Elternteils, behalten aber ihre eigene
 * Haltungsfarbe (interner Dissens bleibt sichtbar). Nach der Verteilung wird das
 * Rad rotiert, damit die Achse stabil bleibt (Naht Nein↔Ja unten, Neutral oben) —
 * unabhängig von den Blockgrössen.
 *
 * Reines SVG, keine Chart-Library.
 */
import { useMemo, useState } from "react";
import type { TaxonomyNode } from "@/types/ballots";
import { Card, CardContent } from "@/components/ui/card";
import { nodeLeaning, nodeDissent } from "@/lib/aggregate";
import {
  ARM_NO,
  ARM_YES,
  TRACK,
  mixRgb,
  rgbStr,
  leanRgb,
  type RGB,
} from "@/lib/chart-palette";

type T = (key: string, values?: Record<string, string | number>) => string;

const SERIF = {
  fontFamily: 'var(--font-serif), Georgia, "Times New Roman", serif',
} as const;

// −/+ mit echtem Minuszeichen, z. B. „+46", „−28". v ∈ [−1,1] → Prozentpunkte.
function signed(v: number): string {
  const n = Math.round(v * 100);
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return "0";
}

// dissent darüber ⇒ Knoten gilt als „gespalten" (hoher Dissens) ⇒ Amber-Rand.
const SPLIT_THRESHOLD = 0.5;

// Pole + Schiene kommen aus der geteilten Palette (chart-palette.ts), damit
// Sunburst und Likert-Balken exakt dieselben Endpunkte/Nullpunkt teilen:
//   ARM_NO (Koralle, Nein) ↔ TRACK (neutral) ↔ ARM_YES (Navy, Ja).
const AMBER = "rgb(217, 159, 40)"; // Blitz + Hinweis für stark gespaltene Knoten

// Geometrie
const SIZE = 420;
const CX = SIZE / 2;
const CY = SIZE / 2;
// Mittelloch wächst stetig mit der Ringzahl (kein Sonderfall): bei einer Ebene
// klein, damit die eine dicke Farbfläche massiv wirkt; bei drei Ebenen grösser,
// damit innen genug Bogenlänge bleibt. centerRadius() interpoliert dazwischen.
const CENTER_R_MIN = 18; // 1 Ring: kleines Loch ⇒ massivere Fläche
const CENTER_R_MAX = 38; // 3 Ringe: grösseres Loch ⇒ mehr Platz für innere Labels
const CENTER_R_COMPACT = 20; // Mobile: eigene, kleine Basis (Ring 1 bekommt mehr Platz)
const OUTER_R = 206; // äusserster Radius (Aussenkante des Track-Rings)
// Aussen-Rand der viewBox für die Block-Labels. Seitlich mehr (breite Labels wie
// „Nein-Themen"), oben/unten weniger (nur „Ausgewogen") ⇒ wenig vertikaler Leerraum.
const VIEW_PAD_X = 96;
const VIEW_PAD_Y = 28;
const BLOCK_LABEL_R = OUTER_R + 8; // Radius der Block-Labels (knapp ausserhalb des Rings)
const BLOCK_LABEL_FONT = 9; // SVG-Einheiten (skaliert mit dem Rad)
const DATA_OUTER_R = OUTER_R; // Aussenkante der Datenringe (kein Track-Band mehr)
const LABEL_MIN_ANGLE = 9; // ° — schmaler ⇒ kein Label (nur Tooltip)
const LABEL_R_FRAC = 0.57; // Label-Position im Ring: >0.5 ⇒ nach aussen (mehr Bogenlänge)
const LABEL_OUTER_PAD = 12; // Compact: Abstand der äussersten Label-Zeile vom Ringrand
const CORNER_R = 4; // abgerundete Segment-Ecken
const PAD_DEG = 1.4; // ° Intra-Block-Luft zwischen Segmenten desselben Blocks
// Breite Inter-Block-Lücke zwischen befüllten Blöcken (≫ PAD_DEG). Leere Blöcke
// kollabieren auf 0° ⇒ ihre angrenzenden Lücken verschmelzen automatisch.
const BLOCK_GAP_DEG = 10;
// Multi-Level: die Spannungslücke unten (Naht Ja↔Nein) ein Tick breiter als die
// übrigen Block-Lücken, damit die Pol-Trennung über alle Ringe klar bleibt. Im
// Single-Level bleibt die Naht bei BLOCK_GAP_DEG ⇒ aufgeräumt & konsistent.
const SEAM_GAP_EXTRA = 4;
// Neutral-Band in Prozentpunkten (identisch zur Skala der Balken-Badges, lean×100):
// |lean·100| ≤ NEUTRAL_BAND ⇒ Neutral-Block; darunter Nein, darüber Ja.
const NEUTRAL_BAND = 20;
const RING_GAP = 4; // radiale Lücke zwischen den Ring-Ebenen (trägt mit den Separatoren die Hierarchie statt eines Track-Rings)
const MAX_LEVELS = 3; // nie mehr als 3 Ringe zeichnen (4. Ebene wird weggelassen)
const THIRD_RING_WIDTH = 16; // 3. Ring nur als dünnes Band; Ebene 1 & 2 teilen den Rest
// Mobile-Variante (`compact`): nur Ring 1 trägt Labels, also bekommt er den
// Löwenanteil des Radius — Ring 2 & 3 sind schmale Farbbänder. So sitzt Ring 1
// (und damit die Labels) bei grossem Radius mit langem Bogen ⇒ mehr Textplatz.
const SECOND_RING_COMPACT_W = 20;
const THIRD_RING_COMPACT_W = 12;
// Compact: Labels werden IMMER auf Höhe der Aussenkante des (mehrebenig) inneren
// Rings verankert — auch wenn nur eine (dicke) Ebene gezeigt wird. So sehen die
// Ring-1-Labels einebenig gleich aus wie mehrebenig (schmaler Bogen ⇒ schmaler,
// dreizeilig) statt am weiten Aussenrand breit/wenigzeilig zu werden.
const COMPACT_LABEL_OUTER_R =
  DATA_OUTER_R - SECOND_RING_COMPACT_W - THIRD_RING_COMPACT_W - RING_GAP / 2;

// Füllfarbe für ein bewertetes Segment: Ton auf der geteilten Skala (leanRgb).
// Unbewertete Segmente füllt der Aufrufer transparent (kein Track mehr); TRACK
// bleibt nur Fallback, falls leanRgb ausnahmsweise null liefert.
function fillFor(lean: number | null | undefined): string {
  return rgbStr(leanRgb(lean) ?? TRACK);
}

// Wahrnehmungs-Helligkeit (Rec. 601) — für Kontrast-Entscheid Label hell/dunkel.
function luminance([r, g, b]: [number, number, number]): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Gestufte Legenden-Skala (diskrete Blöcke statt weichem Verlauf) — spiegelt die
// fünf Stufen der Likert-Verteilung.
const LEGEND_GRADIENT = (() => {
  const cols = [-1, -0.7, -0.4, -0.15, 0.15, 0.4, 0.7, 1].map((l) =>
    rgbStr(leanRgb(l)!),
  );
  const n = cols.length;
  const parts: string[] = [];
  for (let i = 0; i < n; i++)
    parts.push(
      `${cols[i]} ${(i / n) * 100}%`,
      `${cols[i]} ${((i + 1) / n) * 100}%`,
    );
  return `linear-gradient(90deg, ${parts.join(", ")})`;
})();

// Dunkle Töne aus derselben Farbfamilie wie die Füllung — für Label-Text ohne
// harten Weiss-Kontrast / Halo.
const DARK_BLUE: RGB = [28, 52, 120]; // dunkles Blau
const DARK_RED: RGB = [112, 34, 20]; // dunkles Rot
const DARK_NEUTRAL: RGB = [88, 86, 92]; // mittleres Grau

// Label-Farbe kontrastabhängig: auf dunkler (satter) Füllung heller Text, auf
// heller Füllung die dunkle Variante der Segment-Hue (blau→dunkelblau, rot→
// dunkelrot, neutral→mittelgrau). Schwache Neigung mischt Richtung Grau.
function textColor(lean: number | null | undefined): string {
  const c = leanRgb(lean);
  if (!c) return rgbStr(DARK_NEUTRAL); // unbewertet (helle Füllung)
  if (luminance(c) < 128) return "rgb(249, 249, 247)"; // dunkle Füllung → heller Text
  const strength = Math.min(1, Math.abs(lean!));
  const dark = lean! >= 0 ? DARK_BLUE : DARK_RED;
  return rgbStr(mixRgb(DARK_NEUTRAL, dark, strength));
}

// Block-Beschriftung aussen am Rad: Pol-Farben für Ja/Nein, neutrales Grau für
// „Ausgewogen". Translation-Keys aus den Messages.
const BLOCK_LABEL: Record<
  "no" | "neutral" | "yes",
  { key: string; color: string }
> = {
  no: { key: "sunburstBlockNo", color: rgbStr(ARM_NO) },
  neutral: { key: "sunburstBlockNeutral", color: rgbStr(DARK_NEUTRAL) },
  yes: { key: "sunburstBlockYes", color: rgbStr(ARM_YES) },
};

// Label an Wortgrenzen auf bis zu maxLines Zeilen umbrechen; Überlauf mit „…".
// Mit `hyphenate` werden zu lange Einzelwörter über mehrere Zeilen mit Bindestrich
// gebrochen (füllt den Platz, zeigt den ganzen Namen) statt abgeschnitten.
function wrapLabel(
  name: string,
  maxChars: number,
  maxLines: number,
  hyphenate = false,
): string[] {
  const words = name.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  // Ein (zu langes) Wort silbenlos mit „-" auf so viele Zeilen wie nötig brechen,
  // solange noch Zeilen frei sind; der Rest landet in `cur`.
  const hyphenateWord = (w: string): string => {
    while (hyphenate && w.length > maxChars && lines.length < maxLines - 1) {
      lines.push(`${w.slice(0, maxChars - 1)}-`);
      w = w.slice(maxChars - 1);
    }
    return w;
  };
  for (let w of words) {
    if (lines.length >= maxLines) break;
    if (hyphenate && !cur && w.length > maxChars) {
      cur = hyphenateWord(w);
      continue;
    }
    const candidate = cur ? `${cur} ${w}` : w;
    if (!cur || candidate.length <= maxChars || lines.length >= maxLines - 1) {
      cur = candidate; // erstes Wort, passt, oder letzte erlaubte Zeile (wird ggf. gekürzt)
    } else {
      lines.push(cur);
      cur = hyphenateWord(w);
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines
    .slice(0, maxLines)
    .map((l) =>
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
  const r = Math.min(
    cr,
    (rOuter - rInner) / 2,
    halfSpanRad * rInner,
    halfSpanRad * rOuter,
  );
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

type Block = "no" | "neutral" | "yes" | "unrated";

// Block-Zuordnung aus dem aggregierten lean (∈[−1,1]); unbewertet ⇒ eigener Status.
function blockOf(lean: number | null | undefined): Block {
  if (lean == null) return "unrated";
  const pct = lean * 100;
  if (pct < -NEUTRAL_BAND) return "no";
  if (pct > NEUTRAL_BAND) return "yes";
  return "neutral";
}

// Alle Themen sind gleich breit — das Argument-Volumen spielt bewusst KEINE Rolle.
// Jeder Knoten zählt gleich (Gewicht 1): Geschwister teilen ihren Bereich zu
// gleichen Teilen, ein Block ist so breit wie seine Anzahl Themen. Einzige Stelle,
// um wieder auf eine volumen-/bewertungsabhängige Gewichtung umzustellen.
function nodeWeight(_node: TaxonomyNode): number {
  return 1;
}

// Drei-Block-Layout: Ring-1-Knoten nach Block (Nein/Neutral/Ja/Unbewertet)
// gruppieren und zu gleichen Teilen (gleich breit) auf den Kreis verteilen;
// Unterthemen rekursiv gleich breit INNERHALB der Eltern-Grenzen (sie erben so den
// Block). Anschliessend wird das Rad rotiert, damit die Achse stabil bleibt: die
// Naht zwischen Ja- und Nein-Block (durch die Unbewertet-Zone) liegt immer unten
// (180°), Neutral oben — unabhängig von den Blockgrössen.
// Bis `maxLevels` Ebenen (max. MAX_LEVELS; `maxLevels = 1` ⇒ nur Hauptthemen).
function layout(
  root: TaxonomyNode,
  maxLevels: number,
  leanOf: (n: TaxonomyNode) => number | null,
): {
  segs: Seg[];
  maxLevel: number;
  blocks: { block: "no" | "neutral" | "yes"; mid: number }[];
} {
  const cap = Math.min(maxLevels, MAX_LEVELS);
  const segs: Seg[] = [];
  let maxLevel = 0;

  // Einen Knoten samt Teilbaum zu gleichen Teilen (Gewicht je Knoten = 1) in [a0,a1].
  const place = (node: TaxonomyNode, level: number, a0: number, a1: number) => {
    segs.push({ node, level, a0, a1 });
    if (level > maxLevel) maxLevel = level;
    if (level >= cap) return; // tiefere Ebenen nicht zeichnen
    const kids = node.children ?? [];
    if (!kids.length) return;
    const tw = kids.reduce((s, k) => s + nodeWeight(k), 0) || 1;
    let cur = a0;
    for (const k of kids) {
      const w = ((a1 - a0) * nodeWeight(k)) / tw;
      place(k, level + 1, cur, cur + w);
      cur += w;
    }
  };

  // Ring-1-Knoten in Blöcke einsortieren, je Block AUFSTEIGEND nach signiertem lean.
  // In Uhrzeiger-Reihenfolge (Neutral → Ja → Unbewertet → Nein) ergibt das einen
  // durchgehenden Verlauf: das stärkste Nein und das stärkste Ja stossen unten an
  // der Naht zwischen den Polen aneinander (jeweils stärkste Tendenz an der Naht),
  // schwächere wandern Richtung Neutral oben.
  const groups: Record<Block, TaxonomyNode[]> = {
    no: [],
    neutral: [],
    yes: [],
    unrated: [],
  };
  for (const n of root.children ?? []) groups[blockOf(leanOf(n))].push(n);
  for (const b of Object.keys(groups) as Block[])
    groups[b].sort((a, c) => (leanOf(a) ?? 0) - (leanOf(c) ?? 0));

  // Reihenfolge im Uhrzeigersinn (0°=oben, 90°=rechts, 180°=unten, 270°=links):
  // Neutral (oben) → Ja (rechts) → Unbewertet (unten) → Nein (links).
  const order: Block[] = ["neutral", "yes", "unrated", "no"];
  const present = order.filter((b) => groups[b].length);
  const G = present.length;
  // Multi-Level nur, wenn Sublevel erlaubt UND vorhanden — steuert die etwas
  // breitere Spannungslücke unten (SEAM_GAP_EXTRA).
  const multiLevel =
    cap > 1 && (root.children ?? []).some((c) => (c.children?.length ?? 0) > 0);
  // Lücke NACH jedem präsenten Block (zyklisch). Basis = BLOCK_GAP_DEG; die Naht
  // unten zwischen Ja- und Nein-Seite (Spannungslücke) bekommt im Multi-Level einen
  // Tick extra. Höchstens ein Block ⇒ gar keine Lücken (durchgehender Bogen).
  const gapAfter = (i: number): number => {
    if (G < 2) return 0;
    const b = present[i];
    const n = present[(i + 1) % G];
    const seam =
      (b === "yes" && (n === "unrated" || n === "no")) ||
      (b === "unrated" && n === "no");
    return BLOCK_GAP_DEG + (seam && multiLevel ? SEAM_GAP_EXTRA : 0);
  };
  const gaps = present.map((_, i) => gapAfter(i));
  const available = 360 - gaps.reduce((a, g) => a + g, 0);
  const totalW =
    present.reduce(
      (s, b) => s + groups[b].reduce((x, n) => x + nodeWeight(n), 0),
      0,
    ) || 1;

  const bounds = {} as Partial<Record<Block, [number, number]>>;
  let cur = 0;
  present.forEach((b, i) => {
    const start = cur;
    for (const n of groups[b]) {
      const w = (available * nodeWeight(n)) / totalW;
      place(n, 1, cur, cur + w);
      cur += w;
    }
    bounds[b] = [start, cur];
    cur += gaps[i]; // Lücke nach jedem Block (Ring ⇒ auch nach dem letzten)
  });

  // Rotation: anchorRaw (Roh-Winkel) soll nach unten (180°). Mit beiden Polen ist
  // das die Naht zwischen Ja-Ende und Nein-Start (durch die Unbewertet-Zone);
  // sonst Neutral- bzw. den einzigen Block oben. anchorRaw − 180 ⇒ Block oben.
  let anchorRaw: number;
  if (bounds.yes && bounds.no) {
    anchorRaw = (bounds.yes[1] + bounds.no[0]) / 2;
  } else if (bounds.neutral) {
    anchorRaw = (bounds.neutral[0] + bounds.neutral[1]) / 2 - 180;
  } else if (present.length) {
    const o = bounds[present[0]]!;
    anchorRaw = (o[0] + o[1]) / 2 - 180;
  } else {
    anchorRaw = 180;
  }
  const rot = 180 - anchorRaw;
  for (const s of segs) {
    const span = s.a1 - s.a0;
    const a0 = (((s.a0 + rot) % 360) + 360) % 360; // a0 ∈ [0,360); a1 = a0+span (ggf. >360)
    s.a0 = a0;
    s.a1 = a0 + span;
  }

  // Mittel-Winkel je befülltem Pol/Neutral-Block (post-Rotation, normalisiert) für
  // die äusseren Block-Labels. Unbewertet bekommt kein Label.
  const blocks = (["no", "neutral", "yes"] as const)
    .filter((b) => bounds[b])
    .map((b) => {
      const [s0, s1] = bounds[b]!;
      return { block: b, mid: ((((s0 + s1) / 2 + rot) % 360) + 360) % 360 };
    });

  return { segs, maxLevel, blocks };
}

// Radius der Zentrumsscheibe, stetig an die Ringzahl gekoppelt (kein if/else je
// Fall): 1 Ring ⇒ CENTER_R_MIN (kleines Loch, massive Fläche), MAX_LEVELS Ringe
// ⇒ CENTER_R_MAX. Compact hat seine eigene, feste Basis.
function centerRadius(levels: number, compact = false): number {
  if (compact) return CENTER_R_COMPACT;
  const tt =
    MAX_LEVELS > 1 ? (Math.min(levels, MAX_LEVELS) - 1) / (MAX_LEVELS - 1) : 0;
  return Math.round(CENTER_R_MIN + (CENTER_R_MAX - CENTER_R_MIN) * tt);
}

// Ring-Grenzradien je Ebenenzahl. Bei 3 Ebenen bekommt der äusserste Ring nur
// THIRD_RING_WIDTH (dünnes Band); Ebene 1 & 2 teilen den verbleibenden Platz.
// `centerR` = Innenradius des innersten Rings (aus centerRadius()). Die Datenringe
// reichen bis DATA_OUTER_R; der Track-Streifen (TRACK_BAND) liegt ausserhalb davon.
// Rückgabe: radii[level-1]..radii[level] = [Innen, Aussen] des Rings `level`.
function ringRadii(levels: number, centerR: number, compact = false): number[] {
  if (levels <= 1) return [centerR, DATA_OUTER_R];
  if (compact) {
    // Mobile: nur Ring 1 beschriftet ⇒ ihm den Grossteil des Platzes geben
    // (kleineres Mittelloch); Ring 2 & 3 sind reine Bänder (Ring 2 etwas länger).
    if (levels === 2)
      return [centerR, DATA_OUTER_R - SECOND_RING_COMPACT_W, DATA_OUTER_R];
    const inner3 = DATA_OUTER_R - THIRD_RING_COMPACT_W;
    const inner2 = inner3 - SECOND_RING_COMPACT_W;
    return [centerR, inner2, inner3, DATA_OUTER_R];
  }
  if (levels === 2) {
    const step = (DATA_OUTER_R - centerR) / 2;
    return [centerR, centerR + step, DATA_OUTER_R];
  }
  const inner = DATA_OUTER_R - THIRD_RING_WIDTH; // Beginn des dünnen 3. Rings
  const step = (inner - centerR) / 2;
  return [centerR, centerR + step, inner, DATA_OUTER_R];
}

export function TaxonomySunburst({
  root,
  t,
  onSelect,
  compact = false,
}: {
  root: TaxonomyNode;
  t: T;
  onSelect?: (key: string) => void;
  // Mobile-Variante: nur Ring 1 beschriften; Ring 2 & 3 als Bänder (Ring 2 etwas
  // länger als Ring 3). Default = volle Desktop-Darstellung.
  compact?: boolean;
}) {
  const [hover, setHover] = useState<TaxonomyNode | null>(null);
  // Unterthemen (Ebene 2+) standardmässig EINGEBLENDET; per Checkbox abschaltbar.
  const [showSub, setShowSub] = useState(true);
  // Unterebenen standardmässig KOMPAKT (wie mobil: Ebene 2/3 als dünne Bänder, keine
  // Labels) — auch auf dem Desktop. Die Checkbox klappt sie zur vollen Darstellung
  // auf (proportionale Ringe + Labels ab Ebene 2).
  const [expandSub, setExpandSub] = useState(false);

  // Gibt es überhaupt Unterthemen? Sonst ist die Checkbox sinnlos.
  const hasSub = useMemo(
    () => (root.children ?? []).some((c) => (c.children?.length ?? 0) > 0),
    [root],
  );

  // Aggregierte Haltung je Knoten — zentrale Funktion (Schalter in lib/aggregate.ts).
  // Live-Update: `root` wechselt die Referenz bei jeder Bewertung ⇒ Neuberechnung.
  // Vor dem Layout berechnet, weil die Block-Gruppierung den lean braucht.
  const leanMap = useMemo(() => {
    const m = new Map<number, number | null>();
    const walk = (n: TaxonomyNode) => {
      m.set(n.id, nodeLeaning(n));
      for (const c of n.children ?? []) walk(c);
    };
    walk(root);
    return m;
  }, [root]);
  const leanOf = (n: TaxonomyNode) => leanMap.get(n.id) ?? null;

  // Mobil ODER „nicht aufgeklappt" ⇒ kompakte Ring-Geometrie: Ring 1 gross, Ebene
  // 2/3 als dünne Bänder. Aufgeklappt (Desktop) ⇒ proportionale Ringe.
  const subCompact = compact || !expandSub;

  const { segs, radii, maxLevel, centerR, blocks } = useMemo(() => {
    const { segs, maxLevel, blocks } = layout(root, showSub ? MAX_LEVELS : 1, leanOf);
    const centerR = centerRadius(maxLevel, subCompact);
    const radii = ringRadii(maxLevel, centerR, subCompact);
    return { segs, radii, maxLevel, centerR, blocks };
    // leanOf schliesst über leanMap (in den Deps); root-Wechsel ⇒ neuer leanMap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, compact, showSub, subCompact, leanMap]);

  if (!segs.length) return null;

  // Chart-Breite (max-width des Containers, per w-full responsiv): grosszügig, damit
  // das Rad die Card-Breite nutzt. Einebenig etwas schmaler als mehrebenig.
  const chartMaxW = maxLevel <= 1 ? 700 : 1000;
  // Ring-1-Labels auf eine feste gerenderte Grösse (CSS-px) bringen, unabhängig von
  // viewBox-Breite (VIEW_PAD_X) und chartMaxW: rendered_px = labelFont·chartMaxW/VBW
  // ⇒ labelFont = RING1_LABEL_PX·VBW/chartMaxW.
  const RING1_LABEL_PX = 16;
  const labelFont = compact
    ? 13
    : (RING1_LABEL_PX * (SIZE + 2 * VIEW_PAD_X)) / chartMaxW;

  // Standardmässig kein Panel; nur beim Hover erscheint Titel + Bewertung seitlich.
  const active = hover;
  const lean = active ? leanOf(active) : null;
  // Hover zeigt Thema + aggregierte Haltung (in Prozentpunkten); unbewertet:
  // Hinweistext.
  const ratingLabel = active
    ? lean == null
      ? t("sunburstLeanUnrated")
      : `⌀ ${signed(lean)}`
    : "";
  // Farbe = Seite (blau/rot), abgedunkelt für Lesbarkeit.
  const ratingColor =
    lean == null
      ? "rgba(0,0,0,0.5)"
      : rgbStr(mixRgb(lean >= 0 ? ARM_YES : ARM_NO, [30, 30, 30], 0.1));
  // Gespalten (hoher dissent) ⇒ Amber-Hinweis im Panel, passend zum Amber-Rand.
  const activeSplit = !!active && nodeDissent(active) > SPLIT_THRESHOLD;
  // Panel auf die dem Segment gegenüberliegende Seite legen (Winkel 0–180 = rechte
  // Hälfte → Panel links, sonst rechts), damit es das aktive Segment nicht verdeckt.
  const activeSeg = active ? segs.find((s) => s.node === active) : undefined;
  // a1 kann nach der Layout-Rotation > 360 sein ⇒ Mittelwinkel normalisieren.
  const activeMid = activeSeg
    ? (((activeSeg.a0 + activeSeg.a1) / 2) % 360 + 360) % 360
    : 0;
  const panelSide = activeMid > 0 && activeMid < 180 ? "left" : "right";

  return (
    <Card className="border-black/5 py-6">
      <CardContent className="px-6">
        <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t("sunburstEyebrow")}
        </p>
        <div className="mb-1.5 flex items-start justify-between gap-3">
          <p
            className="text-[1.5rem] leading-tight tracking-tight text-foreground"
            style={SERIF}
          >
            {t("sunburstTitle")}
          </p>
          {hasSub && (
            <div className="flex shrink-0 flex-col items-end gap-1">
              <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] text-muted-foreground select-none">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 cursor-pointer accent-current"
                  checked={showSub}
                  onChange={(e) => setShowSub(e.target.checked)}
                />
                {t("sunburstSubtopics")}
              </label>
              {/* Labels ab Ebene 2 nur im Desktop steuerbar (compact zeigt nie
                  tiefer als Ring 1). Erscheint, sobald Unterthemen sichtbar sind. */}
              {!compact && showSub && (
                <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] text-muted-foreground select-none">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 cursor-pointer accent-current"
                    checked={expandSub}
                    onChange={(e) => setExpandSub(e.target.checked)}
                  />
                  {t("sunburstSubLabels")}
                </label>
              )}
            </div>
          )}
        </div>
        <p className="mb-3 max-w-[62ch] text-[13.5px] leading-relaxed text-muted-foreground">
          {t("sunburstSubtitle")}
        </p>

        <div
          className={`relative w-full ${compact ? "-mx-4 max-w-none" : "mx-auto"}`}
          style={compact ? undefined : { maxWidth: chartMaxW }}
        >
          <svg
            viewBox={`${-VIEW_PAD_X} ${-VIEW_PAD_Y} ${SIZE + 2 * VIEW_PAD_X} ${SIZE + 2 * VIEW_PAD_Y}`}
            className="h-auto w-full"
            role="img"
            aria-label={t("sunburstTitle")}
          >
            {/* Kein Track-Ring mehr: Struktur tragen die var(--card)-Separatoren
                (Segment-Stroke) und die radialen RING_GAP-Lücken zwischen den
                Ebenen. Unbewertete Segmente bleiben transparent + gestrichelt. */}
            {segs.map((s) => {
              // Radiale Lücke zwischen den Ebenen: jedes Band beidseitig einrücken.
              // Datenringe enden bei DATA_OUTER_R; der Track-Streifen liegt ausserhalb.
              const rInner = radii[s.level - 1] + RING_GAP / 2;
              const rOuter = radii[s.level] - RING_GAP / 2;
              const thickness = rOuter - rInner; // Ringdicke (3. Ring ist dünn)
              const span = s.a1 - s.a0;
              // Luft zwischen Segmenten: Winkel beidseitig einschrumpfen
              // (höchstens ~⅓ der Breite, damit schmale Segmente bestehen bleiben).
              const pad = Math.min(PAD_DEG, span * 0.35) / 2;
              const pa0 = s.a0 + pad;
              const pa1 = s.a1 - pad;
              const lean = leanOf(s.node);
              const unrated = lean == null; // Schienenfarbe ⇒ gestrichelter Umriss
              // Gespalten = hoher Dissens (Ja- UND Nein-Argumente stark bewertet) ⇒ Amber-Rand.
              const split = nodeDissent(s.node) > SPLIT_THRESHOLD;
              const clickable = !!s.node.key && !!onSelect;
              const mid = (s.a0 + s.a1) / 2;
              // a1 kann nach der Rotation > 360 sein; polar() ist periodisch (mid roh
              // ok), aber Halbkreis-/Flip-Entscheidungen brauchen mid ∈ [0,360).
              const midN = ((mid % 360) + 360) % 360;
              // Innerster Ring: Text gekrümmt entlang des Bogens; tiefere Ringe radial.
              const curved = s.level === 1;
              // 2.+ Ebene (radiale Labels) eine Spur kleiner als die Top-Topics.
              const segFont = curved ? labelFont : Math.max(8, labelFont - 1);
              const segScale = segFont / 10;
              const lineGap = 11 * segScale; // radialer Abstand der gekrümmten Zeilen
              // Bei gespaltenen radialen Segmenten ein Innenband für den Blitz frei
              // halten ⇒ Label zentriert nur im äusseren Rest (kein Overlap).
              const boltGap = split && !curved ? 16 : 0;
              const labelInnerR = rInner + boltGap;
              // Compact-Ring 1 trägt das einzige Label. Block am Aussenrand verankert;
              // höchstens 3 Zeilen, damit er nicht zu weit Richtung Mitte (kurze
              // Bögen) reicht — der lange Bogen weit aussen gibt genug Breite.
              const maxLines = curved
                ? compact
                  ? 3
                  : thickness >= 30
                    ? 3
                    : 2
                : thickness >= 28
                  ? 2
                  : 1;
              // Compact: Labels auf Höhe des (mehrebenig) inneren Rings verankern,
              // damit sie einebenig gleich aussehen (schmal, dreizeilig) statt am
              // weiten Aussenrand des dicken Rings zu kleben. Mehrebenig ist rOuter
              // ohnehin ≈ COMPACT_LABEL_OUTER_R ⇒ unverändert.
              const labelOuterR = compact
                ? Math.min(rOuter, COMPACT_LABEL_OUTER_R)
                : rOuter;
              // Zeichenkapazität an der INNERSTEN möglichen Zeile bemessen (kleinster
              // Radius = kürzester Bogen). Compact: worst case = maxLines, am
              // Aussenrand verankert — so überläuft auch ein voller Block nie.
              const charR = curved
                ? compact
                  ? labelOuterR - LABEL_OUTER_PAD - (maxLines - 1) * lineGap
                  : rInner +
                    (rOuter - rInner) * LABEL_R_FRAC -
                    ((maxLines - 1) / 2) * lineGap
                : 0;
              const maxChars = curved
                ? Math.max(
                    3,
                    Math.floor(
                      ((span / 360) * 2 * Math.PI * charR) / (6.5 * segScale),
                    ),
                  )
                : Math.max(
                    4,
                    Math.floor((rOuter - labelInnerR - 6) / (5.8 * segScale)),
                  );
              // Compact: lange Einzelwörter mit Bindestrich umbrechen statt mit „…".
              const lines = wrapLabel(
                s.node.name,
                maxChars,
                maxLines,
                curved && compact,
              );
              // Label-Radius aus der TATSÄCHLICHEN Zeilenzahl. Compact: oberste Zeile
              // ans Aussenrand-Limit (rOuter − Pad) verankern, Block füllt nach innen
              // ⇒ auch kurze Labels sitzen aussen statt mittig zu schweben. Desktop:
              // Fraktion wie gehabt.
              const labelR = !curved
                ? (labelInnerR + rOuter) / 2
                : compact
                  ? labelOuterR -
                    LABEL_OUTER_PAD -
                    ((lines.length - 1) / 2) * lineGap
                  : rInner + (rOuter - rInner) * LABEL_R_FRAC;
              const [lx, ly] = polar(labelR, mid);
              // Dünne Ringe (z. B. der 3.) bekommen kein Label — nur Farbe.
              // Ring 1 immer; tiefere Ringe nur im Desktop UND wenn aufgeklappt
              // (compact/mobil: nie tiefer als Ring 1). Im kompakten Modus sind die
              // Bänder ohnehin < 22px dick ⇒ greift auch die Dicke-Schranke.
              const showLabel =
                span >= LABEL_MIN_ANGLE &&
                thickness > 22 &&
                (s.level === 1 || (!compact && expandSub));
              // Radiale Ausrichtung (tiefere Ringe): tangential gedreht, links gespiegelt.
              let rot = mid - 90;
              if (midN > 180) rot += 180;
              // Untere Hälfte: Text-Pfad umkehren, sonst stünde der Text kopfüber.
              const flip = midN > 90 && midN < 270;
              return (
                <g key={`${s.node.id}-${s.level}`}>
                  <path
                    d={arcPath(rInner, rOuter, pa0, pa1)}
                    fill={unrated ? "transparent" : fillFor(lean)}
                    // Bewertet ⇒ heller Kartenrand (var(--card), wie die
                    // Balken-Separatoren, strokeWidth 1.5) für eine saubere Kante
                    // gegen die Nachbarn; zusammen mit RING_GAP trägt er die
                    // Struktur (kein Track-Ring mehr). Unbewertet ⇒ transparent mit
                    // gestricheltem, „provisorischem" Rand.
                    stroke={unrated ? "rgba(0,0,0,0.2)" : "var(--card)"}
                    strokeWidth={unrated ? 1 : 1.5}
                    strokeDasharray={unrated ? "3 2.5" : undefined}
                    style={{
                      cursor: clickable ? "pointer" : "default",
                      // Volltonig (keine Tiefen-Transparenz) — die Aussage steckt
                      // allein in der Mischfarbe, exakt wie bei den Balken.
                      opacity: hover && hover !== s.node ? 0.82 : 1,
                      transition: "opacity 120ms",
                    }}
                    onMouseEnter={() => setHover(s.node)}
                    onMouseLeave={() =>
                      setHover((h) => (h === s.node ? null : h))
                    }
                    onClick={() => clickable && onSelect!(s.node.key!)}
                  />
                  {/* Gespalten (hoher Dissens): Blitz-Icon nahe dem Innenradius. */}
                  {split &&
                    (() => {
                      const [bx, by] = polar(rInner + 10, mid);
                      const k = 0.6; // 24er-Icon → ~14 px
                      return (
                        <path
                          d="M13 2 L3 14 L12 14 L11 22 L21 10 L12 10 Z"
                          fill={AMBER}
                          transform={`translate(${bx} ${by}) scale(${k}) translate(-12 -12)`}
                          style={{ pointerEvents: "none" }}
                          opacity={hover && hover !== s.node ? 0.82 : 1}
                        />
                      );
                    })()}
                  {showLabel &&
                    curved &&
                    lines.map((line, i) => {
                      const n = lines.length;
                      // Mehrzeilig: Zeilen radial um die Ring-Mittellinie verteilen.
                      const ri =
                        labelR +
                        (flip ? -1 : 1) * ((n - 1) / 2 - i) * (11 * segScale);
                      const pid = `lp-${s.node.id}-${s.level}-${i}`;
                      return (
                        <g key={pid}>
                          <path
                            id={pid}
                            d={textArcPath(ri, s.a0, s.a1, flip)}
                            fill="none"
                          />
                          <text
                            fill={textColor(lean)}
                            fontSize={segFont}
                            style={{
                              pointerEvents: "none",
                              userSelect: "none",
                            }}
                          >
                            <textPath
                              href={`#${pid}`}
                              startOffset="50%"
                              textAnchor="middle"
                            >
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
                      fill={textColor(lean)}
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
                          dy={
                            i === 0
                              ? `${-(lines.length - 1) * 0.55}em`
                              : "1.1em"
                          }
                        >
                          {line}
                        </tspan>
                      ))}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Block-Labels aussen: „Ja-Themen" (rechts), „Ausgewogen" (oben),
                „Nein-Themen" (links). Position = Mittel-Winkel des jeweiligen
                Blocks; Text-Anker/Baseline aus der Winkelrichtung, damit der Text
                nach aussen läuft statt ins Rad. */}
            {blocks.map(({ block, mid }) => {
              const [bx0, by0] = polar(BLOCK_LABEL_R, mid);
              const rad = ((mid - 90) * Math.PI) / 180;
              const dx = Math.cos(rad);
              const dy = Math.sin(rad);
              const anchor = dx > 0.25 ? "start" : dx < -0.25 ? "end" : "middle";
              const baseline =
                dy > 0.25 ? "hanging" : dy < -0.25 ? "auto" : "central";
              // Seitliche (linke/rechte) Labels etwas nach innen und nach unten
              // rücken, damit die langen „Meine …"-Labels nicht an den Rand stossen.
              const horiz = Math.abs(dx) > 0.25;
              const bx = horiz ? bx0 - Math.sign(dx) * 10 : bx0;
              const by = horiz ? by0 + 10 : by0;
              const { key, color } = BLOCK_LABEL[block];
              return (
                <text
                  key={`blk-${block}`}
                  x={bx}
                  y={by}
                  textAnchor={anchor}
                  dominantBaseline={baseline}
                  fontSize={BLOCK_LABEL_FONT}
                  fontWeight={600}
                  fill={color}
                  style={{
                    letterSpacing: "0.02em",
                    pointerEvents: "none",
                    userSelect: "none",
                  }}
                >
                  {t(key)}
                </text>
              );
            })}

            {/* Zentrumsscheibe — nimmt die Hintergrundfarbe an, damit der Ring
                schwebt statt auf einer Scheibe zu kleben. */}
            <circle
              cx={CX}
              cy={CY}
              r={centerR}
              fill="var(--card)"
              stroke="rgba(0,0,0,0.05)"
            />
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
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5 shrink-0"
                      aria-hidden="true"
                    >
                      <path
                        d="M13 2 L3 14 L12 14 L11 22 L21 10 L12 10 Z"
                        fill={AMBER}
                      />
                    </svg>
                    {t("sunburstDissentNote")}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Legende: Pole auf der durchgehenden Skala — abgesetzt durch eine Linie */}
        <div className="mt-5 border-t border-black/5 pt-4 flex items-center justify-center gap-3 text-[13px] font-medium">
          <span style={{ color: rgbStr(ARM_NO) }}>{t("poleOpponents")}</span>
          <span
            className="h-2.5 w-44 rounded-full"
            style={{ background: LEGEND_GRADIENT }}
          />
          <span style={{ color: rgbStr(ARM_YES) }}>{t("poleSupporters")}</span>
        </div>

        {/* Zweite Zeile: Sonder-Marker — gestricheltes Sektörchen = unbewertet,
            Blitz = gespalten (hoher Dissens). */}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <svg
              viewBox="2 2.7 16 8"
              className="h-3.5 w-7 shrink-0"
              aria-hidden="true"
            >
              <path
                d="M 4.84 4.63 A 9 9 0 0 1 15.16 4.63 L 12.29 8.72 A 4 4 0 0 0 7.71 8.72 Z"
                fill="transparent"
                stroke="rgba(0,0,0,0.2)"
                strokeWidth={1.2}
                strokeDasharray="2 1.6"
                strokeLinejoin="round"
              />
            </svg>
            {t("sunburstLeanUnrated")}
          </span>
          <span className="flex items-center gap-1.5">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 shrink-0"
              aria-hidden="true"
            >
              <path
                d="M13 2 L3 14 L12 14 L11 22 L21 10 L12 10 Z"
                fill={AMBER}
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
