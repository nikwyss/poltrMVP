# Operations & Infra Runbook

Betriebs-Notizen für **Scale-up und Migration** des K8s-Clusters (Infomaniak
Public Cloud, Namespace `poltr`). Ergänzt CLAUDE.md und die dortigen
Federation-Warnungen.

## Node-Sizing — kritisch

Prod lief (Stand 2026-07) auf **einem einzigen Node** vom Typ
`a4-ram8-disk20-perf1` mit nur **~20 GB ephemeral Disk**. Das ist zu klein für
den vollen Stack (PDS, Ozone, Postgres, AppView, CMS, cert-manager, ingress) und
hat am 2026-07-28 einen Outage ausgelöst:

> Disk voll → Kubelet **Disk-Pressure-Eviction-Storm** → ReplicaSets erzeugen
> evicted Pods endlos neu → **~10 700 tote Pod-Objekte** (K8s löscht
> Evicted/Failed **nie** automatisch) → Eviction tötet **ingress-nginx**
> (Port 443 tot, Site down) und wirft den PDS-Image-Cache per Image-GC weg.

**Bei Scale-up / Migration / neuem Node beachten:**

1. **Disk ≥ 40–80 GB** pro Node bereitstellen — NICHT wieder 20 GB. Allein
   `containerd` (Images + Layer) belegt ~6 GB.
2. **journald cappen** — Standard ist unbegrenzt und fraß 1.4 GB. In
   `/etc/systemd/journald.conf`:
   ```ini
   [Journal]
   SystemMaxUse=200M
   ```
   (bzw. beim Node-Provisioning/cloud-init setzen).
3. **CronJob-History-Limits** knapp halten — `peerreview-finalize` läuft
   **jede Minute** (1440 Pods/Tag), `embeddings-backfill` alle 2 min. Ohne
   enge `successfulJobsHistoryLimit`/`failedJobsHistoryLimit` sammeln sich
   Completed/Error-Pods an. Ggf. Schedule verbreitern.
4. **Evicted-Pod-Reaper** als Cronjob ergänzen (Backstop), damit tote Pods
   nicht wieder unbemerkt akkumulieren.

### Aufräum-Playbook bei Disk-Pressure

```bash
# tote Pods je Namespace löschen (K8s tut das nicht selbst)
for ns in poltr cert-manager kube-system ingress-nginx cert-manager-infomaniak; do
  kubectl delete pod -n "$ns" --field-selector=status.phase=Failed    --wait=false
  kubectl delete pod -n "$ns" --field-selector=status.phase=Succeeded --wait=false
done

# journald auf dem Node vakuumieren (privilegierter chroot-Pod, toleriert den
# disk-pressure-Taint via priorityClassName: system-node-critical + tolerations: Exists):
#   chroot /host journalctl --vacuum-size=200M
```
Sobald genug frei ist, fällt der `node.kubernetes.io/disk-pressure`-Taint weg und
ingress/PDS werden automatisch rescheduled.

## PDS-Image — Digest pinnen, `:latest` meiden

`ghcr.io/bluesky-social/pds` publiziert nur `:latest` (keine brauchbaren
Versions-Tags im Registry; die GitHub-Release-Tags `vX.Y.Z` sind **keine**
Image-Tags). Upstream restrukturiert `:latest` gelegentlich hart — zuletzt auf
**Node 24** mit Entry **`/app/index.ts`** (kein `/app/index.js` mehr). Ein
Image-GC-Re-Pull zog dann still das neue Layout und crash-loopte die PDS.

**Regeln für Migration/Rebuild:**

- **Image immer per Digest pinnen** (`…/pds@sha256:…`), nie `:latest` in Prod.
  Aktueller Pin siehe [pds.yaml](../infra/kube/pds.yaml).
- Der Start-Command muss zum Image passen: aktuell
  `node --enable-source-maps /app/index.ts` (= das eigene CMD des Images).
- **`cd /data` ist load-bearing** und darf NICHT entfernt werden:
  `PDS_DATA_DIRECTORY` ist nicht gesetzt (das Secret enthält nur das vom PDS
  **ignorierte** `PDS_DATA_DIR`), daher verankert das cwd das SQLite-Repo.
  Entfernen ⇒ PDS findet sein Repo nicht ⇒ frische Identität ⇒
  **Relay-Federation-Bruch** (unrecoverable, siehe CLAUDE.md).
- Blobs liegen absolut unter `PDS_BLOBSTORE_DISK_LOCATION=/data/blobs`.
- Bei einer echten Migration die `pds-data`-PVC, `PDS_SERVER_DID`,
  `PDS_PLC_ROTATION_KEY_*` unverändert mitnehmen — sonst Federation-Reset nötig.
