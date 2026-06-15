"use client";

/**
 * Positionsband — divergierendes Balkendiagramm. Jedes Top-Thema ein Balken,
 * der von der neutralen Mittellinie ausschlägt: nach links (terrakotta) zu den
 * Nein-Argumenten, nach rechts (blau) zu den Ja-Argumenten.
 *
 * Länge = Stärke der relevanz-gewichteten Pro-Vorlage-Neigung des Viewers
 * (`proLeaning`, -1 … +1), Farbintensität skaliert mit dem Betrag. Themen mit
 * hohem Dissens (`dissent`) werden als „gespalten" markiert.
 *
 * Ohne Bewertungen/Login ist `proLeaning` null → kein Balken, nur ein
 * neutraler Marker auf der Mittellinie.
 */
import type { TaxonomyNode } from "@/types/ballots";
import { Card, CardContent } from "@/components/ui/card";

type T = (key: string) => string;

const SPLIT_THRESHOLD = 0.5;

// Weiche Palette passend zum warmen App-Hintergrund.
const BLUE = { r: 74, g: 119, b: 190 }; // Richtung Befürworter
const TERRA = { r: 178, g: 116, b: 92 }; // Richtung Gegner

// Volltöne für Zahl-Labels (klar lesbar auf cremefarbenem Grund).
const BLUE_TEXT = "rgb(46, 92, 168)";
const TERRA_TEXT = "rgb(166, 86, 56)";

// Maximaler Balken-/Spur-Ausschlag in % je Seite (von der Mitte aus). < 50,
// damit am äusseren Ende Platz für das Zahl-Label bleibt. Feste, symmetrische
// Skala: HALF entspricht ±100 — so bildet die Spur die volle Skala ab.
const HALF = 42;

// Betrag → Deckkraft (kleine Neigung = blass, starke = satt).
function intensity(mag: number): number {
  return 0.32 + 0.6 * Math.min(1, mag / 0.6);
}

function barColor(lean: number): string {
  const c = lean >= 0 ? BLUE : TERRA;
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${intensity(Math.abs(lean))})`;
}

// −/+ mit echtem Minuszeichen, z. B. „+46", „−28".
function signed(lean: number): string {
  const v = Math.round(lean * 100);
  if (v > 0) return `+${v}`;
  if (v < 0) return `−${Math.abs(v)}`;
  return "0";
}

export function PositionBand({ nodes, t }: { nodes: TaxonomyNode[]; t: T }) {
  if (!nodes.length) return null;

  const rowGrid = "grid grid-cols-[minmax(140px,230px)_1fr] items-center gap-3";

  // Leaderboard: nach aggregiertem Mittelwert (proLeaning); unbewertete ans Ende.
  const sorted = [...nodes].sort((a, b) => {
    const av = a.proLeaning;
    const bv = b.proLeaning;
    if (av == null || bv == null) return av == null ? (bv == null ? 0 : 1) : -1;
    return bv - av;
  });

  return (
    <Card className="border-black/5 py-5">
      <CardContent className="px-4">
        <p className="mb-0.5 text-sm font-medium text-foreground/90">
          {t("bandTitle")}
        </p>
        <p className="mb-4 text-[13px] leading-snug text-muted-foreground">
          {t("bandSubtitle")}
        </p>

        {/* Pol-Beschriftung — neutral, da die Seite schon aus der Position folgt */}
        <div className={rowGrid}>
          <span />
          <div className="flex justify-between text-xs font-medium text-muted-foreground">
            <span>{t("poleOpponents")}</span>
            <span>{t("poleSupporters")}</span>
          </div>
        </div>

        {/* Eine Zeile pro Top-Thema */}
        <div className="relative mt-2 flex flex-col gap-1.5">
          {sorted.map((n) => {
            const lean = n.proLeaning;
            const split = (n.dissent ?? 0) > SPLIT_THRESHOLD;
            const frac = lean == null ? 0 : Math.abs(lean) * HALF;
            const pos = lean != null && lean >= 0;
            // Tooltip am Balken/Wert: Seite + Wert (+ Hinweis, wenn gespalten).
            const tip =
              lean == null
                ? t("unrated")
                : `${pos ? t("poleSupporters") : t("poleOpponents")} · ${signed(lean)}` +
                  (split ? ` · ${t("split")}` : "");

            return (
              <div key={n.id} className={rowGrid}>
                <span
                  className="truncate text-left text-sm text-foreground/80"
                  title={n.name}
                >
                  {n.name}
                </span>

                <div className="relative h-7">
                  {/* Skalen-Spur: deutet die volle, symmetrische Skala an, damit
                      auch bei lauter positiven Werten klar ist, dass die Mitte
                      neutral ist (und nicht der Nullpunkt einer 0→rechts-Skala). */}
                  <div
                    className="absolute top-1/2 right-1/2 h-4 -translate-y-1/2 rounded-l-md bg-black/[0.05]"
                    style={{ width: `${HALF}%` }}
                  />
                  <div
                    className="absolute top-1/2 left-1/2 h-4 -translate-y-1/2 rounded-r-md bg-black/[0.05]"
                    style={{ width: `${HALF}%` }}
                  />

                  {/* Mittellinie (neutral) */}
                  <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 border-l border-dashed border-black/20" />

                  {lean == null ? (
                    <span
                      className="absolute top-1/2 left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--line-mid)]"
                      title={t("unrated")}
                    />
                  ) : (
                    <>
                      {/* Balken: schlägt von der Mitte zur jeweiligen Seite aus */}
                      <div
                        className={`absolute top-1/2 h-4 -translate-y-1/2 ${
                          pos
                            ? "left-1/2 rounded-r-md"
                            : "right-1/2 rounded-l-md"
                        }`}
                        style={{
                          width: `${frac}%`,
                          background: barColor(lean),
                        }}
                        title={tip}
                      />
                      {/* Zahl am äusseren Ende */}
                      <span
                        className="absolute top-1/2 -translate-y-1/2 text-xs font-semibold tabular-nums"
                        style={{
                          color: pos ? BLUE_TEXT : TERRA_TEXT,
                          ...(pos
                            ? { left: `calc(50% + ${frac}% + 6px)` }
                            : { right: `calc(50% + ${frac}% + 6px)` }),
                        }}
                        title={tip}
                      >
                        {signed(lean)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* neutral-Label unter der Mittellinie */}
        {/* <div className={rowGrid}>
          <span />
          <div className="relative h-4">
            <span className="absolute left-1/2 -translate-x-1/2 text-xs font-medium text-muted-foreground">
              {t("neutral")}
            </span>
          </div>
        </div> */}
      </CardContent>
    </Card>
  );
}

export default PositionBand;
