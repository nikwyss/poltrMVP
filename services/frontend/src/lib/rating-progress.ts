"use client";

// ─── Bewertungs-Fortschritt (backend-basiert) ───────────────────────────────
// Familiaritäts-Zähler: wie viele *verschiedene* Argumente einer Vorlage der
// Nutzer bewertet hat. Dient als Gate, ab wann das Peer-Review-Polling startet
// (≥ 2 Bewertungen → „hatte Gelegenheit, sich einzulesen").
//
// Quelle ist die serverseitige Argumentliste (`viewer.preference`), NICHT mehr
// localStorage. Damit zählen auch Bewertungen, die in einer früheren Session
// oder auf einem anderen Gerät abgegeben wurden — egal ob heute oder gestern.
// Eine Bewertung im Overlay patcht denselben Cache-Eintrag optimistisch
// (`useArgumentRatingCache`), daher zieht der Zähler ohne Refetch sofort nach.

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { listArguments } from "@/lib/agent";
import { argumentKeys } from "@/lib/queries/arguments";

/**
 * Anzahl verschiedener bewerteter Argumente dieser Vorlage, aus der
 * serverseitigen Argumentliste abgeleitet. Teilt sich den Query-Cache mit der
 * Booklet-Seite (identischer Key), läuft also ohne zusätzlichen Roundtrip, wenn
 * die Liste bereits geladen ist.
 */
export function useRatedArgCount(ballotId: string): number {
  const { isAuthenticated, loading } = useAuth();
  const locale = useLocale();
  const enabled = isAuthenticated && !loading && !!ballotId;

  const { data } = useQuery({
    queryKey: [...argumentKeys.list(ballotId), locale],
    queryFn: () => listArguments(ballotId),
    enabled,
  });

  return useMemo(
    () => (data ?? []).filter((a) => a.viewer?.preference != null).length,
    [data],
  );
}
