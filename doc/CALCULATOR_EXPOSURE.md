# Calculator: öffentliche Exposition härten

**Status:** offen · **Klasse:** Infra/Security-Härtung · **Dringlichkeit:** vor dem Ausrollen neuer Calculator-Endpoints (insb. Embeddings, siehe [LM_PEER_REVIEW.md](LM_PEER_REVIEW.md))

## Befund

Der Calculator hängt heute **vollständig und unauthentifiziert** am öffentlichen Ingress:

```yaml
# infra/kube/ingress.yaml
- host: calculator.poltr.info
  http:
    paths:
      - path: /            # ← alles offen
        pathType: Prefix
        backend: { service: { name: calculator, port: { number: 80 } } }
```

Es gibt **keine** App-seitige Authentifizierung im Calculator. Damit ist jeder Endpoint per HTTPS aus dem Internet aufrufbar — heute die `/api/topdown/*`-Endpoints, künftig auch `/api/embeddings/*`. Kosten-/Missbrauchsrisiko: `/api/topdown/induce`/`classify` und `/api/embeddings/backfill` lösen **LLM-/Embedding-Compute** (Infomaniak-Kosten) aus.

## Warum der Ingress nicht einfach weg kann

Zwei CMS→Calculator-Pfade, einer läuft **im Browser**:

| Pfad | Quelle | URL | Internes DNS möglich? |
|------|--------|-----|------------------------|
| Taxonomie-Panel (Admin-UI) | **Browser** ([TaxonomyPanel.tsx](../services/cms/src/components/TaxonomyPanel.tsx)) | `NEXT_PUBLIC_CALCULATOR_URL` → `https://calculator.poltr.info` | **Nein** — Browser ist außerhalb des Clusters |
| CMS-Backend (Snapshot/Backfill) | Server ([atproto-publish.ts](../services/cms/src/lib/atproto-publish.ts)) | `CALCULATOR_INTERNAL_URL \|\| NEXT_PUBLIC_CALCULATOR_URL` | Ja (Hook existiert) |

Das Admin-Panel ruft `/api/topdown/{induce,classify,grow,tree,unplaced,branch_unplaced}` direkt aus dem Browser → diese Pfade **müssen** öffentlich erreichbar bleiben.

## Fix (minimal, ohne CMS-Umbau)

**Ingress-`path` von `/` auf `/api/topdown` verengen:**

```yaml
- host: calculator.poltr.info
  http:
    paths:
      - path: /api/topdown      # statt "/"
        pathType: Prefix
        backend: { service: { name: calculator, port: { number: 80 } } }
```

Wirkung:
- Admin-Taxonomie (Browser) funktioniert weiter.
- `/api/embeddings/*` und alle übrigen Pfade sind **nicht** mehr von außen erreichbar; Cron + AppView treffen sie clusterintern (`http://calculator.poltr.svc.cluster.local`).
- Das heute zu breite `path: /` wird gleich mit verengt.

Optional sauber: `CALCULATOR_INTERNAL_URL=http://calculator.poltr.svc.cluster.local` für die server-seitigen CMS-Calls setzen, damit diese nicht über den öffentlichen Ingress laufen.

## Vorbestehender, größerer Punkt (separat)

Auch nach der Pfad-Verengung sind die `/api/topdown`-Endpoints **selbst unauthentifiziert** öffentlich — wer die URL kennt, kann `/induce`/`/classify` (LLM-Kosten) auslösen. Das ist bereits heute so und nicht durch das Embedding-Feature verursacht.

Echte Härtung (eigener Aufwand, CMS-Umbau): die Panel-Calls **server-seitig über Payload proxen** (Payload-Route → Calculator clusterintern). Dann braucht der Browser den Calculator gar nicht, der Ingress kann vollständig entfallen, und die Endpoints liegen hinter dem Payload-Admin-Login. Alternativen: nginx-Basic-Auth/IP-Allowlist-Annotation am Ingress oder ein Shared-Secret-Header im Calculator.

## Verwandt
- [LM_PEER_REVIEW.md](LM_PEER_REVIEW.md) — die neuen `/api/embeddings/*`-Endpoints, die diesen Fix nötig machen.
