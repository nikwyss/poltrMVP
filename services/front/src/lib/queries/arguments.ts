"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getArgument } from "@/lib/agent";
import { rateContent } from "@/lib/ballots";
import { taxonomyKeys, patchTaxonomyPreference } from "@/lib/queries/taxonomy";
import type { ArgumentWithMetadata, TaxonomyTree } from "@/types/ballots";

// ─── Query-Keys ──────────────────────────────────────────────────────────────
// Eine Stelle für alle Argument-bezogenen Keys, damit Liste (Booklet) und
// Einzel-Detail (Overlay) garantiert denselben Cache-Eintrag treffen.

export const argumentKeys = {
  // Argumentliste eines Ballots — gelesen von der Booklet-Seite.
  list: (ballotId: string) => ["arguments", ballotId] as const,
  // Ein einzelnes Argument (Overlay-Detail).
  detail: (ballotId: string, rkey: string) =>
    ["argument", ballotId, rkey] as const,
  // Präfix über alle Einzel-Argumente eines Ballots — für Cache-Patches, die
  // jedes geladene Detail mittreffen sollen (z. B. eine Bewertung).
  detailPrefix: (ballotId: string) => ["argument", ballotId] as const,
};

// ─── Einzel-Argument (Overlay-Detail) ────────────────────────────────────────
// Cacht unter `argumentKeys.detail` — denselben Präfix, den
// `useArgumentRatingCache` patcht. Dadurch teilen Booklet-Liste und Overlay-
// Detail eine einzige Quelle der Wahrheit für `viewer.preference`.

export function useArgumentQuery(
  ballotRkey: string,
  rkey: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: argumentKeys.detail(ballotRkey, rkey),
    queryFn: () => getArgument(ballotRkey, rkey),
    enabled,
  });
}

// ─── Bewertung im Cache spiegeln ─────────────────────────────────────────────
// Setzt `viewer.preference` eines Arguments direkt im Cache — sowohl in der
// Liste als auch (falls geladen) im Einzel-Detail. Weil die Booklet-Seite die
// Liste via `useQuery` abonniert, aktualisiert sich ihre Karte dadurch von
// selbst. Das ersetzt die frühere `onArgumentRated`-Callback-Registry.

function withPreference(
  a: ArgumentWithMetadata,
  preference: number | null,
): ArgumentWithMetadata {
  const viewer = { ...a.viewer };
  if (preference === null) delete viewer.preference;
  else viewer.preference = preference;
  return { ...a, viewer };
}

export function useArgumentRatingCache(ballotId: string) {
  const qc = useQueryClient();
  return useCallback(
    (uri: string, preference: number | null) => {
      const apply = (a: ArgumentWithMetadata) =>
        a.uri === uri ? withPreference(a, preference) : a;

      // Booklet-Liste (`viewer.preference`).
      qc.setQueryData<ArgumentWithMetadata[]>(
        argumentKeys.list(ballotId),
        (prev) => prev?.map(apply),
      );
      // Einzel-Argument im Overlay-Detail (`viewer.preference`).
      qc.setQueriesData<ArgumentWithMetadata>(
        { queryKey: argumentKeys.detailPrefix(ballotId) },
        (prev) => (prev ? apply(prev) : prev),
      );
      // Taxonomy-Bäume (base/full/topic, alle Locales): `viewerPreference` an
      // allen Vorkommen der uri im Baum setzen.
      qc.setQueriesData<TaxonomyTree | null>(
        { queryKey: taxonomyKeys.all(ballotId) },
        (prev) => patchTaxonomyPreference(prev, uri, preference) ?? prev,
      );
    },
    [qc, ballotId],
  );
}

// ─── Netzwerk-Write ──────────────────────────────────────────────────────────
// Reine Mutation für den eigentlichen POST. Optimistik + Rollback laufen im
// Aufrufer über `useArgumentRatingCache` (sofortiges UI) — diese Mutation
// kümmert sich nur um den serverseitig idempotenten Schreibvorgang.

type RateVars = { uri: string; cid: string; preference: number };

export function useRateArgumentMutation() {
  return useMutation({
    mutationFn: ({ uri, cid, preference }: RateVars) =>
      rateContent(uri, cid, preference),
  });
}
