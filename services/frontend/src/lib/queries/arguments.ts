"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getArgument } from "@/lib/agent";
import { rateContent } from "@/lib/ballots";
import { taxonomyKeys, patchTaxonomyPreference } from "@/lib/queries/taxonomy";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { isPdsError, type PdsError } from "@/lib/pdsError";
import { notifyPdsError } from "@/lib/toast";
import type { ArgumentWithMetadata, TaxonomyTree } from "@/types/ballots";

// Bewertungen werden gebündelt: schnelle Reglerbewegungen / +–-Klicks lösen nur
// EINEN Netzwerk-Write aus (letzter Wert), nach dieser Ruhephase in ms.
const RATE_DEBOUNCE_MS = 1000;

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
  const locale = useLocale();
  return useQuery({
    // Locale in the key so switching language refetches (localized via the
    // proxy's ?lang injection). detailPrefix stays locale-free for cache patches.
    queryKey: [...argumentKeys.detail(ballotRkey, rkey), locale],
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

      // Booklet-Liste (`viewer.preference`) — Prefix-Match über alle Locales,
      // da der Listen-Key jetzt die Locale enthält.
      qc.setQueriesData<ArgumentWithMetadata[]>(
        { queryKey: argumentKeys.list(ballotId) },
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

// ─── Persönliche Bewertung (Slider-Logik, geteilt) ───────────────────────────
// Kapselt das komplette Verhalten der RelevanceRating: lokalen Slider-State aus
// `argument.viewer.preference` seeden, optimistisch updaten + in den Cache
// spiegeln (Booklet/Detail/Taxonomie), gebündelt schreiben (Debounce) und bei
// Fehlern zurückrollen. Wird vom Argument-Overlay (argument-detail) UND vom
// Gutachten-Overlay (peer-review-detail) genutzt — eine einzige Quelle.
//
// `argument` darf null sein (noch ladend); `commitRelevance` ist dann ein No-Op.
export function useArgumentRating(
  ballotRkey: string,
  argument: ArgumentWithMetadata | null,
) {
  const te = useTranslations("errors");
  const [relevance, setRelevance] = useState<number | null>(null);
  // Letzter erfolgreich persistierter Wert — Rollback-Baseline bei Fehlern.
  const committed = useRef<number | null>(null);
  const patchRating = useArgumentRatingCache(ballotRkey);
  const rateMutation = useRateArgumentMutation();

  // Slider-State aus dem geladenen Argument seeden — nur bei Argumentwechsel
  // (Key = uri), damit ein Cache-Patch durch die eigene Bewertung nicht zurücksetzt.
  useEffect(() => {
    const pref = argument?.viewer?.preference ?? null;
    setRelevance(pref);
    committed.current = pref;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [argument?.uri]);

  // Gebündelter Netzwerk-Write: optimistik hat `commitRelevance` bereits angewandt;
  // hier feuert nur der POST nach RATE_DEBOUNCE_MS Ruhe mit dem letzten Wert.
  const { debounced: debouncedRate } = useDebouncedCallback(
    (uri: string, cid: string, value: number) => {
      const prev = committed.current;
      rateMutation.mutate(
        { uri, cid, preference: value },
        {
          onSuccess: () => {
            committed.current = value;
          },
          onError: (err) => {
            setRelevance(prev);
            patchRating(uri, prev);
            notifyPdsError(
              te,
              isPdsError(err) ? err : ({ code: "unknown", status: 0 } as PdsError),
            );
          },
        },
      );
    },
    RATE_DEBOUNCE_MS,
  );

  // Beim Loslassen des Reglers / +–-Buttons: optimistisches UI + Cache, dann Write.
  const commitRelevance = (value: number) => {
    if (!argument) return;
    const uri = argument.uri;
    setRelevance(value);
    patchRating(uri, value);
    debouncedRate(uri, argument.cid, value);
  };

  return { relevance, setRelevance, commitRelevance };
}
