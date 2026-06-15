"use client";

/**
 * Taxonomie-Icicle — die „ausgerollte" Mobile-Variante des Meinungsrads
 * ({@link ./taxonomy-sunburst.tsx}): ein klassischer Eiszapfen (top-down
 * Partition-Layout). Die Wurzel liegt oben, die Hierarchie wächst nach unten;
 * jede Ebene ist eine Zeile, jeder Knoten ein Rechteck, dessen **Breite ∝
 * Grösse** (`argumentCount` im Teilbaum) ist. Geschwister sind links→rechts nach
 * Zustimmung sortiert (links = näher Nein / rot, rechts = näher Ja / blau,
 * unbewertet ganz rechts). Bewusst **ohne Beschriftung**, 3 Ebenen — ein
 * kompakter Struktur-Überblick, der auch auf schmalen Screens funktioniert.
 *
 * Farbe = `proLeaning` ∈ [-1,1] des Viewers — identische diverging-Skala wie die
 * Sunburst (rot → neutral → blau, entsättigt; unbewertet = weiss mit feinem,
 * gestricheltem Rand). Stark gespaltene Knoten (hoher `dissent`) bekommen einen
 * Amber-Rand. Antippen eines Segments öffnet das jeweilige Thema.
 *
 * Reines HTML/CSS (prozentual positionierte Rechtecke) — skaliert responsiv in
 * der Breite bei fixen Zeilenhöhen, ohne SVG-Verzerrung. Die Farb-Helfer sind
 * bewusst aus taxonomy-sunburst.tsx dupliziert, damit die bestehende
 * Sunburst-Komponente unangetastet bleibt.
 */
import type { TaxonomyNode } from "@/types/ballots";
import { Card, CardContent } from "@/components/ui/card";

type T = (key: string, values?: Record<string, string | number>) => string;

// dissent darüber ⇒ Knoten gilt als „gespalten" ⇒ Amber-Rand.
const SPLIT_THRESHOLD = 0.5;

// Pole — konsistent mit Sunburst / Positionsband.
const RED: [number, number, number] = [178, 58, 33]; // Gegner-Seite
const BLUE: [number, number, number] = [37, 99, 235]; // Befürworter-Seite
const MID: [number, number, number] = [233, 230, 224]; // neutrale Mitte (warmes Grau)
const AMBER = "rgb(217, 159, 40)"; // Rand für stark gespaltene Knoten
const DESAT: [number, number, number] = [244, 244, 245]; // #f4f4f5 (zinc-100)
const DESAT_T = 0.28; // ~28 % Richtung Hellgrau
const UNRATED: [number, number, number] = [255, 255, 255]; // unbewertet = weiss

// Layout-Geometrie (HTML-Pixel; Breite skaliert prozentual, Höhe bleibt fix).
const MAX_DEPTH = 3; // Wurzel = 0 (nicht gezeichnet), Ebenen 1..3
const ROW_H = 50; // Höhe einer Ebenen-Zeile
const ROW_GAP = 4; // vertikaler Abstand zwischen den Ebenen
const COL_GAP_PX = 2; // horizontale Luft zwischen Geschwistern
const MIN_SIZE = 1; // Mindestgrösse, damit 0-Argument-Knoten nicht verschwinden

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

// proLeaning -1..1 → diverging rot↔neutral↔blau, entsättigt; null = weiss.
function fillFor(lean: number | null | undefined): string {
  if (lean == null) return rgb(UNRATED);
  const base =
    lean >= 0 ? mixT(MID, BLUE, Math.min(1, lean)) : mixT(MID, RED, Math.min(1, -lean));
  return rgb(mixT(base, DESAT, DESAT_T));
}

// Geschwister-Sortierung links→rechts: aufsteigende Zustimmung (am meisten Nein
// links, am meisten Ja rechts), unbewertete (null) ganz rechts. Stabiler Sort ⇒
// bei gleicher Neigung bleibt die Backend-Reihenfolge erhalten.
function byApprovalAsc(a: TaxonomyNode, b: TaxonomyNode): number {
  const la = a.proLeaning ?? Number.POSITIVE_INFINITY;
  const lb = b.proLeaning ?? Number.POSITIVE_INFINITY;
  return la - lb;
}

function sizeOf(node: TaxonomyNode): number {
  return Math.max(node.argumentCount ?? 0, MIN_SIZE);
}

interface Rect {
  node: TaxonomyNode;
  depth: number; // 1 = oberste Ebene
  x0: number; // Fraktion [0,1]
  x1: number;
}

// Rekursive Partition: jedes Kind belegt einen zur Grösse proportionalen
// Anteil der horizontalen Spanne des Elternknotens. Blätter vor MAX_DEPTH
// erzeugen keine tieferen Rechtecke ⇒ Weissraum darunter (klassischer Eiszapfen).
function partition(root: TaxonomyNode): Rect[] {
  const out: Rect[] = [];
  const walk = (node: TaxonomyNode, depth: number, x0: number, x1: number) => {
    if (depth >= 1) out.push({ node, depth, x0, x1 });
    if (depth >= MAX_DEPTH) return;
    const kids = [...(node.children ?? [])].sort(byApprovalAsc);
    if (!kids.length) return;
    const total = kids.reduce((s, k) => s + sizeOf(k), 0) || 1;
    let x = x0;
    for (const k of kids) {
      const w = (x1 - x0) * (sizeOf(k) / total);
      walk(k, depth + 1, x, x + w);
      x += w;
    }
  };
  walk(root, 0, 0, 1);
  return out;
}

export function TaxonomyIcicle({
  root,
  t,
  onSelect,
}: {
  root: TaxonomyNode;
  t: T;
  onSelect?: (key: string) => void;
}) {
  const rects = partition(root);
  if (!rects.length) return null;

  const height = MAX_DEPTH * ROW_H + (MAX_DEPTH - 1) * ROW_GAP;

  return (
    <Card className="border-black/5 py-5">
      <CardContent className="px-4">
        <p className="mb-0.5 text-sm font-medium text-foreground/90">{t("sunburstTitle")}</p>
        <p className="mb-3 text-[13px] leading-snug text-muted-foreground">
          {t("sunburstSubtitle")}
        </p>

        {/* Eiszapfen: oben Wurzel-Ebene, nach unten tiefere Themen-Ebenen. */}
        <div className="relative w-full" style={{ height }}>
          {rects.map((r) => {
            const unrated = r.node.proLeaning == null;
            const split = (r.node.dissent ?? 0) > SPLIT_THRESHOLD;
            const clickable = !!r.node.key && !!onSelect;
            // Tiefere Ebenen leicht zurücknehmen (wie die äusseren Sunburst-Ringe).
            const depthT = (r.depth - 1) / (MAX_DEPTH - 1);
            const opacity = 1 - depthT * (1 - 0.62);
            const border = split
              ? `1.5px solid ${AMBER}`
              : unrated
                ? "1px dashed rgba(0,0,0,0.22)"
                : "1px solid transparent";
            return (
              <button
                key={`${r.node.id}-${r.depth}`}
                type="button"
                disabled={!clickable}
                onClick={clickable ? () => onSelect!(r.node.key!) : undefined}
                title={r.node.name}
                aria-label={r.node.name}
                style={{
                  position: "absolute",
                  top: (r.depth - 1) * (ROW_H + ROW_GAP),
                  height: ROW_H,
                  left: `calc(${r.x0 * 100}% + ${COL_GAP_PX / 2}px)`,
                  width: `calc(${(r.x1 - r.x0) * 100}% - ${COL_GAP_PX}px)`,
                  background: fillFor(r.node.proLeaning),
                  border,
                  opacity,
                }}
                className={`rounded-[3px] transition-opacity ${
                  clickable ? "cursor-pointer hover:opacity-80" : "cursor-default"
                }`}
              />
            );
          })}
        </div>

        {/* Legende — identisch zur Sunburst (nur Marker als Rechteck-Swatches). */}
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

        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-[3px]"
              style={{ background: fillFor(null), border: "1px dashed rgba(0,0,0,0.3)" }}
            />
            {t("sunburstLeanUnrated")}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-[3px]"
              style={{ background: fillFor(0), border: `1.5px solid ${AMBER}` }}
            />
            {t("sunburstDissentNote")}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default TaxonomyIcicle;
