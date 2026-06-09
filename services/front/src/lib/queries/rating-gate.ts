"use client";

import { useTaxonomyBase } from "@/lib/queries/taxonomy";
import type { TaxonomyNode } from "@/types/ballots";

// ─── Bewertungs-Gate ─────────────────────────────────────────────────────────
// Generisches, wiederverwendbares Freischalt-Kriterium über den Themenbaum: ein
// Bereich (z. B. die Analyse-Sektion) wird erst sichtbar, wenn der Nutzer in
// JEDEM Top-Thema genügend Argumente bewertet hat. Zielwert pro Thema ist
// `perTopicTarget` (Default 2), fällt aber auf die Argumentanzahl des Themas,
// falls dieses weniger Argumente hat (sonst liesse sich ein Thema mit 1 Argument
// nie erfüllen). Themen ohne Argumente verlangen 0 Bewertungen.
//
// Gerechnet wird über die Teilbaum-Aggregate `ratedCount` / `argumentCount`, die
// auf jedem Knoten bereits vorhanden sind und von `patchTaxonomyPreference`
// (taxonomy.ts) bei jeder Bewertung lokal nachgezogen werden — der Gate-Status
// aktualisiert sich daher live aus dem React-Query-Cache, ohne Refetch.

export interface RatingGateTopic {
  id: number;
  name: string;
  rated: number;
  target: number;
  met: boolean;
}

export interface RatingGate {
  unlocked: boolean;
  topicsMet: number;
  topicsTotal: number;
  perTopic: RatingGateTopic[];
}

/**
 * Reine Funktion: berechnet den Gate-Status aus einer Liste von Knoten (i. d. R.
 * den Top-Themen `tree.children`). Wiederverwendbar mit beliebigen Knotenlisten
 * und Zielwerten (z. B. ein künftiges Gate über Unterthemen eines Knotens).
 */
export function computeRatingGate(
  topics: TaxonomyNode[],
  perTopicTarget = 2,
): RatingGate {
  const perTopic: RatingGateTopic[] = topics.map((node) => {
    const target = Math.min(perTopicTarget, node.argumentCount);
    const rated = node.ratedCount ?? 0;
    return { id: node.id, name: node.name, rated, target, met: rated >= target };
  });
  const topicsMet = perTopic.filter((tp) => tp.met).length;
  return {
    // Leere Themenliste ⇒ nichts zu sperren ⇒ freigeschaltet.
    unlocked: perTopic.every((tp) => tp.met),
    topicsMet,
    topicsTotal: perTopic.length,
    perTopic,
  };
}

/**
 * Hook-Variante: liest den Basis-Themenbaum aus dem geteilten Query-Cache und
 * leitet den Gate-Status ab. Global verfügbar — jede Komponente erhält denselben
 * live aktualisierten Wert. Bevor der Baum geladen ist, gilt der Bereich als
 * gesperrt (`unlocked: false`), damit Charts nicht kurz aufblitzen.
 */
export function useRatingGate(
  ballotId: string,
  locale: string,
  enabled = true,
): RatingGate {
  const { data } = useTaxonomyBase(ballotId, locale, enabled);
  return computeRatingGate(data?.tree.children ?? []);
}
