"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// App-weiter TanStack-Query-Provider. Der zentrale, reaktive Cache hinter
// `useQuery`/`useMutation`: jede Komponente abonniert einen Query-Key, und wer
// denselben Key ändert (z. B. eine Bewertung im Overlay), lässt alle Abonnenten
// neu rendern — das ersetzt die frühere Overlay-Callback-Registry.
//
// `staleTime` repliziert das alte `pageCache`-TTL (60 s): innerhalb des Fensters
// gilt der Cache als frisch, kein Refetch bei Zurück-Navigation → die Seite
// rendert in identischer Höhe (Voraussetzung für die pixelgenaue Scroll-
// Restoration). `gcTime` hält die Daten danach noch im Speicher.
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  // Den Client in State halten (nicht als Modul-Singleton), damit SSR-Requests
  // sich keinen Cache teilen und HMR ihn nicht bei jedem Render neu erzeugt.
  const [client] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
