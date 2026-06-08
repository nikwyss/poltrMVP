"use client";

import { useQuery } from "@tanstack/react-query";
import { listComments } from "@/lib/agent";

// Query-Key für die flache Kommentarliste eines Arguments. Beide Detail-Views
// (Argument- und Comment-Overlay) abonnieren denselben Key pro Argument, womit
// Likes/Antworten in der einen Ansicht in der anderen mitlaufen.
export const commentKeys = {
  list: (argumentUri: string) => ["comments", argumentUri] as const,
};

// `__none__` als Platzhalter-Key, solange die Argument-URI noch unbekannt ist
// (Detail lädt das Argument zuerst). `enabled` verhindert den Fetch bis dahin.
export function useCommentsQuery(argumentUri: string | undefined) {
  return useQuery({
    queryKey: commentKeys.list(argumentUri ?? "__none__"),
    queryFn: () => listComments(argumentUri!),
    enabled: !!argumentUri,
  });
}
