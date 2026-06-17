/**
 * Zentrale Aggregierung der Argument-Bewertungen zu einer Themen-Haltung.
 *
 * EIN Schalter (`AGG_METHOD`) für ALLE Themen-Plots (Meinungsrad, Verteilung
 * je Thema) und die ThemeCard-Insight. Wer die Aggregierung wechseln will,
 * ändert nur diese Datei.
 *
 * Diskussion / Begründung der Methodenwahl: siehe `doc/AGGREGATION.md`.
 *
 * UNIPOLARES Modell: Die Frage lautet „Wie stark spricht dieses Argument für ein
 * Ja [bzw. Nein] zur Vorlage?". Die Richtung kommt aus dem Argument-Typ, der
 * Regler misst nur die Stärke `preference ∈ [0, 100]`. Daraus der Beitrag
 *   c = (PRO ? +1 : −1) · preference / 100  ∈ [−1, 1]
 * (Pro: +[0,1] Richtung Ja, Contra: −[0,1] Richtung Nein). `preference = 0`
 * („spricht gar nicht dafür") = c = 0 = kein Beitrag. Die Aggregierung verdichtet
 * die Beiträge eines Teilbaums zu einem Wert ∈ [−1, 1] (oder `null`, wenn nichts
 * bewertet wurde).
 */
import type { TaxonomyNode, TaxonomyArgument } from "@/types/ballots";

export type AggMethod = "mean" | "net" | "noisy-or" | "power" | "lehmer";

/** ZENTRALER SCHALTER — hier (und nur hier) die Aggregierung wechseln. */
export const AGG_METHOD: AggMethod = "noisy-or";

/** Parameter der parametrischen Methoden (greifen nur bei der jeweiligen Methode). */
export const AGG_POWER_P = 3; // Potenzmittel: 1 = Mittelwert, →∞ = Max
export const AGG_LEHMER_P = 2; // Lehmer-Mittel: 1 = Mittelwert, 2 = „kontraharmonisch"
// Noisy-OR-Dämpfung γ: 1 = reine Oder-Logik (Beiträge addieren sich voll). <1
// dämpft REDUNDANZ — da jedes Argument isoliert bewertet wird, zählt Noisy-OR
// zwei quasi-gleiche Argumente sonst als zwei unabhängige Evidenzen. γ<1 ist die
// logische Ergänzung zur Frage „wie stark spricht das Argument dafür?", kein Notbehelf.
// export const AGG_NOISY_GAMMA = 1; // schwache argumente werden stark gezählt
export const AGG_NOISY_GAMMA = 0.8; // schwache argumente werden etwas abgewschächt

/**
 * distinct Bewertungs-Beiträge c ∈ [−1,1] über den ganzen Teilbaum eines Knotens.
 * Dedupliziert über die Argument-uri (ein Argument kann an mehreren Knoten hängen).
 * Unipolar: c = (PRO ? +1 : −1) · preference/100. `preference = 0` ergibt c = 0
 * (kein Beitrag), zählt aber als bewertet (für `n`/Mittelwert).
 */
export function collectLeaningContribs(node: TaxonomyNode): number[] {
  const seen = new Map<string, number>();
  const walk = (n: TaxonomyNode) => {
    for (const a of (n.arguments ?? []) as TaxonomyArgument[]) {
      if (a.viewerPreference == null || seen.has(a.uri)) continue;
      const sign = a.type === "PRO" ? 1 : -1;
      seen.set(a.uri, (sign * a.viewerPreference) / 100);
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(node);
  return [...seen.values()];
}

/* ---------- einseitige Kombinatoren (Beträge ∈ [0,1] → Score ∈ [0,1]) ---------- */

// Noisy-OR (gedämpft mit γ): kombiniert Beiträge wie unabhängige Evidenz —
// „Lücke zu 100 schliessen". Eine 1.0 sättigt (bei γ=1) sofort, eine 0 ist
// neutral (Faktor 1−0 = 1, ändert nichts → schwache Argumente ziehen nie runter),
// mehrere mittelstarke bauen sich auf (sättigend). γ<1 dämpft Redundanz.
export const noisyOr = (ps: number[], g: number = AGG_NOISY_GAMMA) =>
  1 - ps.reduce((acc, p) => acc * (1 - g * p), 1);

/**
 * Zerlegt den Soft-OR-Score in die Beiträge („Happen") der einzelnen Argumente:
 * jedes Argument schliesst einen schrumpfenden Bruchteil der Restlücke zu 1.
 *   δᵢ = γ·pᵢ·(1 − S_{i−1})   mit  S_i = S_{i−1} + δᵢ
 * Absteigend sortiert (stärkstes zuerst = Basis); Σδᵢ = noisyOr(ps). Für die
 * Segmente im Soft-OR-Balken (DivergingLikert).
 */
export function noisyOrBites(
  ps: number[],
  g: number = AGG_NOISY_GAMMA,
): { mag: number; bite: number }[] {
  const sorted = [...ps].sort((a, b) => b - a);
  let s = 0;
  return sorted.map((mag) => {
    const bite = g * mag * (1 - s);
    s += bite;
    return { mag, bite };
  });
}

// Potenzmittel (Hölder): p=1 → Mittelwert, p→∞ → Max. Stufenloser Regler.
const powerMean = (xs: number[], p: number) =>
  xs.length ? (xs.reduce((a, x) => a + x ** p, 0) / xs.length) ** (1 / p) : 0;

// Lehmer-Mittel: Σxᵖ / Σxᵖ⁻¹ — starke Beiträge gewichten sich selbst hoch.
const lehmer = (xs: number[], p: number) => {
  const den = xs.reduce((a, x) => a + x ** (p - 1), 0);
  return den > 0 ? xs.reduce((a, x) => a + x ** p, 0) / den : 0;
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * Aggregiert signierte Beiträge zu einer Themen-Haltung ∈ [−1, 1]
 * (−1 = Nein, +1 = Ja) oder `null`, wenn nichts bewertet wurde.
 *
 * Außer beim arithmetischen Mittel werden Pro- und Kontra-Seite GETRENNT auf
 * ihren Beträgen aggregiert (Pro-Score, Kontra-Score) und dann verrechnet
 * (Netto-Richtung = Pro − Kontra). Vgl. `doc/AGGREGATION.md`.
 */
export function aggregateLeaning(contribs: number[]): number | null {
  if (!contribs.length) return null;

  if (AGG_METHOD === "mean") {
    return sum(contribs) / contribs.length;
  }

  const pos = contribs.filter((c) => c > 0);
  const neg = contribs.filter((c) => c < 0).map((c) => -c);

  if (AGG_METHOD === "net") {
    // Normierter Netto-Wert — entspricht dem bisherigen `proLeaning`.
    const total = sum(pos) + sum(neg);
    return total > 0 ? (sum(pos) - sum(neg)) / total : 0;
  }

  let proScore = 0;
  let conScore = 0;
  switch (AGG_METHOD) {
    case "noisy-or":
      proScore = noisyOr(pos);
      conScore = noisyOr(neg);
      break;
    case "power":
      proScore = powerMean(pos, AGG_POWER_P);
      conScore = powerMean(neg, AGG_POWER_P);
      break;
    case "lehmer":
      proScore = lehmer(pos, AGG_LEHMER_P);
      conScore = lehmer(neg, AGG_LEHMER_P);
      break;
  }
  return proScore - conScore;
}

/** Bequemer Direktzugriff: Knoten → aggregierte Haltung ∈ [−1,1] | null. */
export function nodeLeaning(node: TaxonomyNode): number | null {
  return aggregateLeaning(collectLeaningContribs(node));
}

/**
 * Kontroversität ∈ [0,1] eines Knotens: 1 = Pro- und Kontra-Seite gleich stark
 * (gespalten), 0 = nur eine Seite. `2·min(Pro,Kontra)/(Pro+Kontra)` über die
 * Beträge der Beiträge. Unabhängig von `AGG_METHOD` (separater Signal: Richtung
 * vs. Kontroversität, vgl. doc/AGGREGATION.md).
 */
export function aggregateDissent(contribs: number[]): number {
  const pos = sum(contribs.filter((c) => c > 0));
  const neg = sum(contribs.filter((c) => c < 0).map((c) => -c));
  const total = pos + neg;
  return total > 0 ? (2 * Math.min(pos, neg)) / total : 0;
}

/** Bequemer Direktzugriff: Knoten → Kontroversität ∈ [0,1]. */
export function nodeDissent(node: TaxonomyNode): number {
  return aggregateDissent(collectLeaningContribs(node));
}
