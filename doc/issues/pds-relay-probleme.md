# Bluesky PDS – Relay-Probleme (Zusammenfassung)

## Problem 1: Throttling beim Erststart (Race Condition)

### Was passiert?

Beim initialen Boot eines PDS kann es zu einer **Race Condition** kommen:

Wenn das **Identity Event** an den Relay gesendet wird, **bevor** das Repo vollständig initialisiert ist und der Relay das Repo ingestieren kann, stuft der Relay das Repo als **broken / abuse-verdächtig** ein:

```
RepoInactive: throttled
```

→ Dieser Zustand ist **permanent** und erholt sich **nicht automatisch**.

### Ursache

**Startup-Race-Condition + fehlende Recovery-Logik im Relay**

```
PDS boot → DID + Identity Event
→ Repo + Firehose + Relay Handshake noch nicht bereit
→ Relay sieht Identity ohne Repo
→ throttle
```

Begünstigt durch: Container Cold Start, Kubernetes / Azure Container Instances, Netzwerk-Latenz, PLC/Identity schneller als Repo-Infrastruktur.

### Auswirkungen

- Account bleibt dauerhaft **unsichtbar** im Bluesky-Netzwerk
- Relay verweigert Ingestion
- AppView zeigt nur kaputte Stub-Einträge
- Handle-Toggle oder `requestCrawl` helfen **nicht**
- **Nur kompletter Account-Neuaufbau behebt es**

### Wann tritt es auf?

**Nur bei Initialisierung:** Erstes Boot, Neuinstallation, Disaster Recovery, Restore aus Backup, Identity Rotation, PLC Reset. **Nicht im normalen laufenden Betrieb.**

### Sichere Boot-Reihenfolge (Best Practice)

```
1. PDS starten
2. Warten bis Firehose + Relay-Handshake aktiv
3. Repo erzeugen
4. Ersten Commit schreiben
5. Prüfen: relay getLatestCommit OK
6. Erst dann Identity Event senden
```

Minimaler Schutz vor Identity-Emission:

```bash
until relay_getLatestCommit works; do
  sleep 1
done
# Erst danach Identity registrieren
```

---

## Problem 2: Sequenz-Lücke nach PDS-Reset

### Was passiert?

Wenn ein PDS zurückgesetzt wird (Neuinstallation, Datenverlust), startet die Firehose-Sequenznummer (`seq`) wieder bei 1. Der Relay merkt sich aber den letzten `seq`-Wert (z.B. `2200`) und verbindet sich mit `?cursor=2200`. Da der PDS keine Events über 2200 hat, werden **alle neuen Events stillschweigend ignoriert**.

### Symptom

- Neue Posts, Follows etc. erscheinen nicht im Netzwerk
- PDS läuft lokal einwandfrei
- Relay verbindet sich, bekommt aber keine neuen Events

### Lösung: Sequenznummer manuell hochsetzen

**Schritt 1 – PDS stoppen:**

```bash
cd /pds
docker compose down
```

**Schritt 2 – Sequenzer-DB inspizieren:**

```bash
sqlite3 /pds/data/sequencer.sqlite
```

```sql
.tables
.schema repo_seq
SELECT MAX(seq) FROM repo_seq;
```

**Schritt 3 – Sequenz über den alten Wert setzen** (z.B. über 2200):

```sql
-- Variante A: sqlite_sequence Tabelle updaten (bei AUTOINCREMENT)
UPDATE sqlite_sequence SET seq = 2500 WHERE name = 'repo_seq';

-- Variante B: Je nach Schema ggf. Dummy-Row einfügen
-- → .schema repo_seq vorher prüfen!
```

**Schritt 4 – PDS starten und Aktivität erzeugen:**

```bash
docker compose up -d
# Dann einen Post oder Profilupdate machen, damit ein Event mit seq > 2200 emittiert wird
```

**Schritt 5 – Re-Crawl beim Relay anfordern:**

```bash
curl -X POST "https://bsky.network/xrpc/com.atproto.sync.requestCrawl" \
  -H "Content-Type: application/json" \
  -d '{"hostname": "pds2.poltr.info"}'
```

### Hintergrund

Die AT-Proto-Spezifikation erlaubt beliebige Lücken in Sequenznummern. Der `seq`-Wert muss nur monoton steigen. Es ist also völlig legitim, von seq=1 direkt auf seq=2500 zu springen.

---

## Problem 3: Throttling-Risiko beim Restore

### Kurzfassung

Ja, beim Restore kann das exakt wieder passieren. **Aber: Du kannst es vollständig kontrollieren.**

### Was ist das Risiko beim Restore?

Beim Restore passiert technisch fast dasselbe wie beim Erst-Boot:

- Repo wird neu geladen
- Firehose startet neu
- Relay-Verbindung wird neu aufgebaut
- Identity Events werden ggf. neu emittiert

→ Wenn die Reihenfolge wieder falsch ist → **exakt derselbe Throttle-Bug.**

### Sichere Restore-Strategie (produktionsfähig)

**Prinzip: Identity-Emission muss das LETZTE sein.**

Empfohlener Restore-Ablauf:

```
1) PDS starten (ohne PLC / Identity sync)
2) Repo-Dumps einspielen
3) Firehose + Relay Verbindung stabilisieren
4) Warten bis relay getLatestCommit OK
5) Erst jetzt Identity Events aktivieren
```

### Konkrete technische Umsetzung

**Variante A — Identity temporär deaktivieren**

Beim Restore:
- PLC sync / identity push deaktivieren
- Erst nach vollständigem Repo-Import wieder aktivieren

**Variante B — Health-Gated Identity Emission (Best)**

Identity-Events nur senden, wenn:

```
relay_getLatestCommit(did) == current_repo_rev
```

→ Erst wenn Relay ingestiert hat, darf Identity gesendet werden.

**Variante C — Recovery Script (Notfall)**

Wenn es trotzdem passiert:

```
- Account löschen
- PLC Entry rotieren
- Repo neu importieren
- Sauber neu announcen
```

→ Technisch möglich, aber produktiv hässlich.

### Kann das mitten im Betrieb passieren?

**Nein.** Nur bei (Neu-)Initialisierung oder Restore.

---

## TL;DR

| Problem | Ursache | Fix |
|---|---|---|
| **Throttling** | Identity Event vor Repo-Ready → Relay blockiert permanent | Saubere Boot-Reihenfolge; ggf. Account neu aufsetzen |
| **Seq-Lücke** | PDS-Reset → seq startet bei 1, Relay erwartet höhere seq | `sequencer.sqlite` manuell auf Wert > letzter bekannter seq setzen |
| **Restore-Risiko** | Restore = quasi Erst-Boot → gleiche Race Condition möglich | Identity-Emission erst nach Repo-Import + Relay-Handshake |

Alle drei Probleme treten **nur bei (Neu-)Initialisierung oder Restore** auf. Im laufenden Betrieb ist der PDS stabil.
