# TLS Certificate Management

POLTR uses **cert-manager** with the **Let's Encrypt DNS-01 challenge** to issue and renew TLS certificates. DNS-01 is required for wildcard certificates (`*.id.poltr.ch`, `*.poltr.info`) and to keep validation off the public HTTP path.

The DNS-01 solver is delivered by the **Infomaniak ACME webhook** (Infomaniak hosts the DNS zones).

## Why DNS-01

| | HTTP-01 | DNS-01 |
|---|---|---|
| Wildcard certs | ❌ not supported | ✅ supported |
| Internal services without public HTTP | ❌ needs Ingress | ✅ works |
| Throttling on relay/firewall | sensitive | irrelevant |

We **must** use DNS-01 because the handle domain `*.id.poltr.ch` is a wildcard, and ATProto handles (`ballot-XXX.id.poltr.ch`, `userXXX.id.poltr.ch`) need valid TLS for the `/.well-known/atproto-did` lookup that Bluesky AppView and other ATProto clients perform during handle resolution. Without valid TLS, no external client can resolve any POLTR handle.

## Components

```
Certificate (Kubernetes) --> ClusterIssuer (letsencrypt-prod-dns)
                                 |
                                 v
                       DNS-01 webhook solver
                                 |
                                 v
                  Infomaniak DNS API (TXT records)
```

| Component | Where | Source |
|---|---|---|
| cert-manager | `cert-manager` namespace | Stock cert-manager install |
| ClusterIssuer `letsencrypt-prod-dns` | cluster-scope | [`infra/cert/cert-manager-wildcard.yaml`](../infra/cert/cert-manager-wildcard.yaml) |
| Infomaniak webhook | `cert-manager-infomaniak` namespace | https://github.com/Infomaniak/cert-manager-webhook-infomaniak |
| API-Token secret | `cert-manager/infomaniak-api-credentials` | created manually (see below) |

## Managed certificates

| `Certificate` | DNS names | Secret | Used by |
|---|---|---|---|
| `poltr-handle-tls` | `*.id.poltr.ch` | `poltr-handle-tls` | Ingress route for ATProto handle resolution (per-user + per-ballot community accounts) |
| `poltr-wildcard-cert` | `*.poltr.info` | `poltr-wildcard-tls` | Ingress for `pds2.poltr.info`, `app.poltr.info`, `cms.poltr.info`, etc. |
| `poltr-ch-cert` / `poltr-ch-tls` | `poltr.ch`, `www.poltr.ch` | `poltr-ch-tls` | Ingress for the public frontend |

All three are auto-created from Ingress annotations in [`infra/kube/ingress.yaml`](../infra/kube/ingress.yaml) (`cert-manager.io/cluster-issuer: letsencrypt-prod-dns`) or declared explicitly in [`infra/cert/cert-manager-wildcard.yaml`](../infra/cert/cert-manager-wildcard.yaml).

## One-time setup

These steps were performed on 2026-06-01. They only need to be repeated if the cluster is rebuilt, the webhook is uninstalled, or the API token is rotated.

### 1. Generate an Infomaniak API token

1. Open https://manager.infomaniak.com/v3/profile/api-tokens (or search "API" in the Infomaniak Manager).
2. Click **Create a token**.
3. Set scope **Domain** (full read+write — needed to add/remove `_acme-challenge` TXT records).
4. Set a long expiration (or none). The token must outlive any certificate (which itself rotates every ~90 days).
5. Copy the token immediately — Infomaniak does not show it again.

### 2. Install the webhook

Releases are published as a rendered Kubernetes manifest (older docs in this repo mention a Helm chart — that distribution method is gone, the Helm repo URL returns 404):

```bash
# Check latest release first:
curl -s https://api.github.com/repos/Infomaniak/cert-manager-webhook-infomaniak/releases/latest \
  | grep tag_name

# Install (example: v0.3.1):
kubectl apply -f https://github.com/Infomaniak/cert-manager-webhook-infomaniak/releases/download/v0.3.1/rendered-manifest.yaml
```

This creates the namespace `cert-manager-infomaniak`, a Deployment (`infomaniak-webhook`), a Service, an APIService (`v1alpha1.acme.infomaniak.com`), and the RBAC needed for the cert-manager ServiceAccount to call the webhook.

### 3. Create the token Secret

```bash
kubectl create secret generic infomaniak-api-credentials \
  -n cert-manager \
  --from-literal=api-token='<TOKEN>'
```

Name and key **must** be `infomaniak-api-credentials` / `api-token`. The webhook ships a `Role` with `resourceNames: [infomaniak-api-credentials]` that scopes its read access to exactly this Secret name — pick any other name and you will see `secret 'cert-manager/<other-name>' not found` errors in the webhook logs.

### 4. Verify

```bash
kubectl get apiservice v1alpha1.acme.infomaniak.com   # AVAILABLE=True
kubectl get pods -n cert-manager-infomaniak           # Running
kubectl get certificates -n poltr                     # READY=True (after ~1–5 min)
```

## Routine maintenance

cert-manager handles the day-to-day rotation. **No manual action needed under normal conditions.**

| Item | Cadence | Action |
|---|---|---|
| Certificate renewal | Automatic, ~30 days before expiry | cert-manager creates new `Order` + `Challenge` + writes new Secret in place |
| Let's Encrypt account key | Set-and-forget (in `letsencrypt-prod-dns-account-key`) | None |
| Webhook image patch versions | Periodic (see below) | Re-apply the latest `rendered-manifest.yaml` URL |
| Infomaniak API token | Only if expiration was set, or if compromised | Create new token in Infomaniak UI, `kubectl create secret … --dry-run=client -o yaml | kubectl replace -f -` |

### Health checks (optional)

These are not required, but worth running once a month or after a cluster event:

```bash
# All three certs should be READY=True
kubectl get certificates -n poltr

# Pod should be Running with low restart count
kubectl get pods -n cert-manager-infomaniak

# Both APIService entries should be AVAILABLE=True
kubectl get apiservice | grep -E "cert-manager.io|acme.infomaniak.com"
```

### Webhook upgrades

Webhook upgrades are not automatic. To upgrade:

```bash
# Check the new release notes first for breaking changes
curl -s https://api.github.com/repos/Infomaniak/cert-manager-webhook-infomaniak/releases/latest

# Re-apply the new manifest (kubectl apply is idempotent)
kubectl apply -f https://github.com/Infomaniak/cert-manager-webhook-infomaniak/releases/download/vX.Y.Z/rendered-manifest.yaml
```

Pin to a specific version in commands and READMEs so accidental upgrades don't happen via `:latest`.

## Troubleshooting

### Cert stuck in `READY=False`

```bash
kubectl describe certificate <name> -n poltr | tail -40
kubectl get challenges -A
kubectl get events -n poltr --sort-by='.lastTimestamp' | tail -20
```

Common conditions and fixes:

| Status / Reason | Cause | Fix |
|---|---|---|
| `SecretMismatch: Existing private key is not up to date for spec` | `Certificate` spec was changed (e.g. private-key algorithm) but the old Secret blocks the reissue | `kubectl delete secret <secretName> -n poltr` — cert-manager will recreate it with a fresh key pair |
| `SecretMismatch: Existing issued Secret is not up to date for spec: [spec.dnsNames]` | DNS names in spec were changed | same — delete the Secret |
| `Error presenting challenge: infomaniak.acme.infomaniak.com is forbidden` | Webhook is **not installed** or RBAC is missing | (Re-)install the webhook manifest (see "One-time setup" step 2) |
| `Challenge failed: NXDOMAIN` or DNS timeout | Token lacks Domain scope, or token expired | Regenerate token, replace the secret |
| Challenges stuck in `pending` after backoff | cert-manager waits exponentially after failed attempts | Force a retry: `kubectl delete challenge -n poltr --all` (cert-manager will recreate fresh challenges immediately) |

### Forcing renewal

If for any reason a certificate must be re-issued before its scheduled renewal:

```bash
# Recommended: cert-manager will create a new Order/Challenge automatically
kubectl cert-manager renew <certificate-name> -n poltr

# Heavier hammer: delete the secret + the certificate request
kubectl delete certificaterequest -n poltr <name>
kubectl delete secret -n poltr <secretName>
```

### What breaks if certs expire

- `*.id.poltr.ch` cert expired → external ATProto clients can't resolve any POLTR handle (`/.well-known/atproto-did` fails TLS), Bluesky federation breaks, atproto-browser shows "invalid handle". **The PDS itself still works internally.**
- `*.poltr.info` cert expired → all `pds2.`, `app.`, `cms.` HTTPS endpoints break for public clients.
- `poltr.ch` cert expired → the public frontend serves invalid TLS.

Browsers and most clients will hard-fail at the TLS handshake — no graceful degradation. Set up monitoring/alerting on `kubectl get certificates` if not yet done.

## History

| Date | Event |
|---|---|
| 2026-02-12 | `poltr-handle-tls` initially issued |
| 2026-04-13 | Scheduled renewal date — fails silently because of `SecretMismatch` |
| 2026-05-13 | `poltr-handle-tls` expires — POLTR handle resolution breaks externally |
| 2026-06-01 | Diagnosed: Infomaniak webhook missing from cluster (was never reinstalled after a cluster operation). Reinstalled v0.3.1 + created API token + Secret. Initial Secret name `infomaniak-api-token` failed with `not found` — webhook's bundled Role only grants read access to `infomaniak-api-credentials`. Secret renamed + ClusterIssuer patched. All three certs re-issued. |
