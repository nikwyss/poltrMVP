"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { searchBallot } from "@/lib/agent";

// Locale is part of the key: a language switch re-queries automatically (and
// the backend searches only that language's text).
export const searchKeys = {
  query: (ballotId: string, locale: string, q: string) =>
    ["ballot-search", ballotId, locale, q] as const,
};

const MIN_QUERY_LEN = 2;

export function useBallotSearch(
  ballotId: string,
  locale: string,
  q: string,
) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: searchKeys.query(ballotId, locale, trimmed),
    queryFn: () => searchBallot(ballotId, trimmed, locale),
    enabled: Boolean(ballotId) && trimmed.length >= MIN_QUERY_LEN,
    // Keep the previous results visible while the next request is in flight so
    // the dropdown doesn't flash empty between keystrokes.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
