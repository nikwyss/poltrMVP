"use client";

import { useQuery } from "@tanstack/react-query";
import { getTaxonomy } from "@/lib/agent";
import type {
  TaxonomyTree,
  TaxonomyNode,
  TaxonomyArgument,
} from "@/types/ballots";

// ─── Query-Keys ──────────────────────────────────────────────────────────────
// Locale ist Teil des Keys, weil `getTaxonomy` lokalisiert. Der gemeinsame
// Präfix `["taxonomy", ballotId]` erlaubt es, mit einem `setQueriesData` alle
// Varianten (base/full/topic, jede Locale) auf einmal zu patchen.

export const taxonomyKeys = {
  all: (ballotId: string) => ["taxonomy", ballotId] as const,
  base: (ballotId: string, locale: string) =>
    ["taxonomy", ballotId, locale, "base"] as const,
  full: (ballotId: string, locale: string) =>
    ["taxonomy", ballotId, locale, "full"] as const,
  topic: (ballotId: string, locale: string, topic: string) =>
    ["taxonomy", ballotId, locale, "topic", topic] as const,
};

export function useTaxonomyBase(
  ballotId: string,
  locale: string,
  enabled = true,
) {
  return useQuery({
    queryKey: taxonomyKeys.base(ballotId, locale),
    queryFn: () => getTaxonomy(ballotId, locale),
    enabled,
  });
}

export function useTaxonomyFull(
  ballotId: string,
  locale: string,
  enabled = true,
) {
  return useQuery({
    queryKey: taxonomyKeys.full(ballotId, locale),
    queryFn: () => getTaxonomy(ballotId, locale, undefined, "full"),
    enabled,
  });
}

export function useTaxonomyTopic(
  ballotId: string,
  locale: string,
  topic: string,
  enabled = true,
) {
  return useQuery({
    queryKey: taxonomyKeys.topic(ballotId, locale, topic),
    queryFn: () => getTaxonomy(ballotId, locale, topic),
    enabled,
  });
}

// ─── Knoten-Aggregate (Client-Spiegel von _aggregate) ───────────────────────
// QUELLE DER WAHRHEIT ist das Backend: services/appview/src/routes/deliberation/
// taxonomy.py → `_aggregate`. Diese Funktion ist ein bewusst gehaltener Mirror,
// damit Bewertungen lokal sofort durchschlagen (ohne Refetch/Indexer-Lag). Bei
// Formel-Änderungen im Backend HIER nachziehen — der Mirror heilt sich sonst
// erst beim nächsten vollen Laden (Backend bleibt autoritativ).
//
// Postorder über den Teilbaum, identisch zu `_aggregate`: je Knoten die DISTINCT-
// uris des GANZEN Teilbaums (eigene + rekursiv die der Kinder) sammeln, dann
// pos/neg/rated darüber. Damit korrekt für den verschachtelten full-Baum
// (Sunburst, je Knoten direkte Argumente) UND den flachen base/topic-Baum (je
// Knoten bereits der rollup). `argumentCount` bleibt unangetastet (ändert sich
// durch eine Bewertung nicht).
const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

// ─── Bewertung im Baum spiegeln ──────────────────────────────────────────────
// Neue Tree-Kopie mit `viewerPreference` an ALLEN Vorkommen der uri (Multi-
// Membership) UND je Knoten frisch berechneten Aggregaten (Postorder). Knoten
// ohne Argumente im Teilbaum bleiben unangetastet → keine Überschreibung auf
// null/0 (defensiv gegen einen alten slim-Baum ohne Argument-Projektion).
export function patchTaxonomyPreference(
  tree: TaxonomyTree | null | undefined,
  uri: string,
  preference: number | null,
): TaxonomyTree | null | undefined {
  if (!tree?.tree) return tree;

  // Liefert den neuen Knoten + die distinct Argumente seines Teilbaums (Map
  // uri→arg), damit der Elternknoten sie dedupliziert vereinigen kann.
  const visit = (
    node: TaxonomyNode,
  ): { node: TaxonomyNode; subtree: Map<string, TaxonomyArgument> } => {
    const ownArgs = (node.arguments ?? []).map((a) =>
      a.uri === uri ? { ...a, viewerPreference: preference } : a,
    );
    const childResults = node.children.map(visit);

    const subtree = new Map<string, TaxonomyArgument>();
    for (const a of ownArgs) if (!subtree.has(a.uri)) subtree.set(a.uri, a);
    for (const cr of childResults)
      for (const [u, a] of cr.subtree) if (!subtree.has(u)) subtree.set(u, a);

    const next: TaxonomyNode = {
      ...node,
      arguments: ownArgs,
      children: childResults.map((cr) => cr.node),
    };

    if (subtree.size > 0) {
      let pos = 0;
      let neg = 0;
      let rated = 0;
      for (const a of subtree.values()) {
        const pref = a.viewerPreference;
        if (pref == null) continue;
        rated += 1; // 0 („spricht gar nicht dafür") zählt als bewertet, trägt 0 bei
        const sign = a.type === "PRO" ? 1 : -1;
        // Unipolar: c = Vorzeichen·pref/100 (siehe lib/aggregate.ts + doc/AGGREGATION.md).
        const contrib = (sign * pref) / 100; // ∈ [-1,1]
        if (contrib > 0) pos += contrib;
        else if (contrib < 0) neg += -contrib;
      }
      const total = pos + neg;
      next.proLeaning = total > 0 ? round4((pos - neg) / total) : null;
      next.dissent = total > 0 ? round4((2 * Math.min(pos, neg)) / total) : 0;
      next.ratedCount = rated;
    }

    return { node: next, subtree };
  };

  return { ...tree, tree: visit(tree.tree).node };
}
