"use client";

// ─── Peer-Review-Benachrichtigung (Polling) ─────────────────────────────────
// Pollt offene Peer-Review-Einladungen des aktuellen Nutzers und liefert die
// erste *für die aktuelle Vorlage* zurück. Das Polling startet erst, wenn der
// Nutzer mindestens `RATING_GATE_THRESHOLD` Argumente dieser Vorlage bewertet
// hat — gezählt aus der serverseitigen Argumentliste (`viewer.preference`),
// also unabhängig davon, wann die Bewertung abgegeben wurde (siehe
// lib/rating-progress).

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { getPendingPeerreviews } from "@/lib/agent";
import { useRatedArgCount } from "@/lib/rating-progress";
import type { PeerreviewInvitation } from "@/types/ballots";

// Mindestanzahl bewerteter Argumente, bevor überhaupt gepollt wird.
export const RATING_GATE_THRESHOLD = 2;
// Poll-Intervall (1 Minute).
const POLL_INTERVAL_MS = 60_000;

export interface PeerReviewNotification {
  /** Einladungen dieser Vorlage (älteste zuerst), oder leer. */
  invitations: PeerreviewInvitation[];
  /** Ob das Polling aktiv ist (Gate erfüllt + eingeloggt). */
  active: boolean;
  /**
   * Ob noch auf das erste Ergebnis gewartet wird (aktiv, aber noch keine Daten).
   * Wichtig für Gates, die bei Unklarheit gesperrt bleiben sollen, statt kurz
   * verbotenen Inhalt aufblitzen zu lassen.
   */
  loading: boolean;
}

/**
 * Liefert offene Peer-Review-Einladungen für `ballotId`. Pollt nur, wenn der
 * Nutzer eingeloggt ist und das Bewertungs-Gate erfüllt hat.
 */
export function usePeerReviewNotifications(ballotId: string): PeerReviewNotification {
  const { isAuthenticated, loading } = useAuth();
  const ratedCount = useRatedArgCount(ballotId);
  const gateMet = ratedCount >= RATING_GATE_THRESHOLD;
  const enabled = isAuthenticated && !loading && gateMet && !!ballotId;

  const { data, isLoading } = useQuery({
    queryKey: ["peerreview-pending"],
    queryFn: getPendingPeerreviews,
    enabled,
    refetchInterval: enabled ? POLL_INTERVAL_MS : false,
    // Direkt beim Freischalten einmal sofort prüfen, nicht erst nach 60 s.
    refetchOnMount: true,
    staleTime: 0,
  });

  const invitations = (data ?? [])
    .filter((inv) => inv.argument?.ballotRkey === ballotId)
    .sort((a, b) => a.invitedAt.localeCompare(b.invitedAt));

  // isLoading ist nur true, solange aktiviert UND noch kein (auch kein
  // gecachtes) Ergebnis vorliegt; bei disabled-Query ist es false.
  return { invitations, active: enabled, loading: isLoading };
}
