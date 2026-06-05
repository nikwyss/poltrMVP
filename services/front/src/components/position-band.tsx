"use client";

/**
 * Positionsband — jedes Top-Thema ein Punkt zwischen den Polen
 * „Position der Gegner" (links, rot) ↔ „Position der Befürworter" (rechts, blau).
 * Position = relevanz-gewichtete Pro-Vorlage-Neigung des Viewers (`proLeaning`,
 * -1 … +1). Themen mit hohem Dissens (`dissent`) werden als „gespalten" markiert.
 *
 * Ohne Bewertungen/Login ist `proLeaning` null → Punkt in der Mitte (grau).
 */
import type { TaxonomyNode } from "@/types/ballots";
import { Card, CardContent } from "@/components/ui/card";

type T = (key: string) => string;

const THRESHOLD = 0.12;
const SPLIT_THRESHOLD = 0.5;

const COL_BLUE = "rgb(37, 99, 235)";
const COL_RED = "rgb(178, 58, 33)";
const COL_AMBER = "rgb(217, 159, 40)";
const COL_GREY = "var(--line-mid)";

function dotColor(lean: number | null | undefined): string {
  if (lean == null) return COL_GREY;
  if (lean > THRESHOLD) return COL_BLUE;
  if (lean < -THRESHOLD) return COL_RED;
  return COL_AMBER;
}

// proLeaning -1..1 → 0..100 % (links Gegner, rechts Befürworter); null = Mitte.
function dotX(lean: number | null | undefined): number {
  if (lean == null) return 50;
  return Math.max(3, Math.min(97, ((lean + 1) / 2) * 100));
}

export function PositionBand({
  nodes,
  t,
}: {
  nodes: TaxonomyNode[];
  t: T;
}) {
  if (!nodes.length) return null;
  const rowGrid = "grid grid-cols-[minmax(110px,190px)_1fr_70px] items-center gap-3";

  return (
    <Card className="border-black/5">
      <CardContent className="pt-6">
        <p className="mb-4 text-xs text-muted-foreground">{t("bandTitle")}</p>

        {/* Pol-Beschriftung */}
        <div className={rowGrid}>
          <span />
          <div className="flex justify-between text-xs font-medium">
            <span style={{ color: COL_RED }}>{t("poleOpponents")}</span>
            <span className="text-muted-foreground">{t("ambivalent")}</span>
            <span style={{ color: COL_BLUE }}>{t("poleSupporters")}</span>
          </div>
          <span />
        </div>

        {/* Eine Zeile pro Top-Thema */}
        <div className="mt-1 flex flex-col">
          {nodes.map((n) => {
            const x = dotX(n.proLeaning);
            const split = (n.dissent ?? 0) > SPLIT_THRESHOLD;
            return (
              <div key={n.id} className={rowGrid}>
                <span className="truncate text-right text-sm" title={n.name}>
                  {n.name}
                </span>
                <div className="relative flex h-9 items-center">
                  <div className="h-px w-full bg-[var(--line,#e5e7eb)]" />
                  <span
                    className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-sm"
                    style={{ left: `${x}%`, background: dotColor(n.proLeaning) }}
                    title={
                      n.proLeaning == null
                        ? t("unrated")
                        : `${Math.round(n.proLeaning * 100)}`
                    }
                  />
                </div>
                <span className="text-xs" style={{ color: COL_AMBER }}>
                  {split ? t("split") : ""}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default PositionBand;
