/**
 * Geteilte Farb-Palette + Haltungs→Farbe-Interpolation für die Themen-Charts
 * (Likert-Balken `diverging-likert.tsx` & Sunburst `taxonomy-sunburst.tsx`).
 *
 * EIN Satz Pole + EINE Interpolationsfunktion für beide Charts, damit „ganz
 * Nein" und „ganz Ja" überall exakt dieselbe Farbe haben: die Balken-Arme und
 * die Sunburst-Segmente teilen sich Endpunkte und Nullpunkt.
 *
 *   Koralle (Nein)  ◄──────  TRACK (neutral / Schiene)  ──────►  Navy (Ja)
 *
 * Metapher: TRACK ist die Schiene (Nullpunkt), die gefärbten Flächen sind die
 * „Füllung auf der Schiene". lean ∈ [−1,1] interpoliert linear von TRACK zum
 * jeweiligen Pol; `null` = unbewertet (kein Farbwert → Aufrufer zeigt die
 * Schienenfarbe mit gestricheltem Rand).
 */

export type RGB = [number, number, number];

// Pole — identisch mit den beiden Balken-Armen.
export const ARM_NO: RGB = [202, 112, 88]; // korallen / terrakotta = Nein (links)
export const ARM_YES: RGB = [60, 90, 143]; // navy = Ja (rechts)
// Schiene (Track) / neutraler Nullpunkt — warmes Hellgrau.
export const TRACK: RGB = [238, 234, 226];

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

export function mixRgb(c1: RGB, c2: RGB, t: number): RGB {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

export function rgbStr(c: RGB): string {
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

// CSS-String-Varianten der Pole/Schiene (für Komponenten, die direkt Strings setzen).
export const ARM_NO_CSS = rgbStr(ARM_NO);
export const ARM_YES_CSS = rgbStr(ARM_YES);
export const TRACK_CSS = rgbStr(TRACK);

/**
 * Haltung lean ∈ [−1,1] → Füllton auf der Skala Koralle ↔ TRACK ↔ Navy.
 * Schwache Neigung bleibt nahe der Schiene (hell), starke Neigung wird satt.
 * `null`/`undefined` = unbewertet → kein Farbwert (Aufrufer zeigt die Schiene).
 */
export function leanRgb(lean: number | null | undefined): RGB | null {
  if (lean == null) return null;
  return lean >= 0
    ? mixRgb(TRACK, ARM_YES, Math.min(1, lean))
    : mixRgb(TRACK, ARM_NO, Math.min(1, -lean));
}
