# Bluesky Interoperability: birthDate und AppView-Problematik

## Problem

Beim Login über den offiziellen Bluesky-Client (bsky.app) wird eine Altersverifikation verlangt. Bluesky zeigt die Meldung:

> "Um dein Geburtsdatum festlegen zu können, musst du dich mit deinem Hauptpasswort einloggen"

### Ursache

1. **birthDate wird nicht im PDS gespeichert**: Der offizielle Bluesky PDS validiert das Geburtsdatum bei `createAccount`, speichert es aber nicht persistent in der SQLite-Datenbank.

2. **birthDate ist eine Preference**: Das Geburtsdatum wird als User-Preference über `app.bsky.actor.putPreferences` gespeichert - und diese Daten landen auf dem **AppView**, nicht dem PDS.

3. **Hardcoded AppView-DID im Bluesky-Client**: Der offizielle Bluesky-Client sendet bei Requests den Header:
   ```
   atproto-proxy: did:web:api.bsky.app#bsky_appview
   ```
   Dies ist hardcoded und kann nicht geändert werden. Der Client fordert explizit Bluesky's AppView an.

## Architektur-Überblick

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Bluesky Client │────▶│    User's PDS   │────▶│ Bluesky AppView │
│   (bsky.app)    │     │ (pds2.poltr.info)│     │  (api.bsky.app) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │ atproto-proxy:        │ PDS_BSKY_APP_VIEW_*   │
        │ did:web:api.bsky.app  │                       │
        │ (hardcoded!)          │                       │
        ▼                       ▼                       ▼
   Fordert immer          Muss wissen wie         Speichert
   Bluesky's AppView      api.bsky.app zu         Preferences
                          erreichen ist           (inkl. birthDate)
```

## Versuchte Lösungsansätze

### 1. Eigenes AppView als Proxy (gescheitert)

**Idee**: PDS zeigt auf eigenes AppView (app.poltr.info), das Requests zu Bluesky proxied und birthDate injiziert.

**Konfiguration**:
```yaml
PDS_BSKY_APP_VIEW_URL: "https://app.poltr.info"
PDS_BSKY_APP_VIEW_DID: "did:web:app.poltr.info"
```

**Problem**: Der Bluesky-Client sendet `atproto-proxy: did:web:api.bsky.app`. Der PDS kennt diese DID nicht und gibt 404 zurück.

**Ergebnis**: Funktioniert nicht mit dem offiziellen Bluesky-Client.

### 2. birthDate bei getPreferences injizieren (teilweise möglich)

**Idee**: Eigenes AppView fängt `app.bsky.actor.getPreferences` ab und fügt birthDate hinzu.

**Code** (`bsky_proxy.py`):
```python
def inject_birthdate_preference(response_content: bytes) -> bytes:
    data = json.loads(response_content)
    preferences = data.get("preferences", [])
    has_birthdate = any(
        p.get("$type") == "app.bsky.actor.defs#birthDate"
        for p in preferences
    )
    if not has_birthdate:
        preferences.append({
            "$type": "app.bsky.actor.defs#birthDate",
            "birthDate": "1970-01-01"
        })
    return json.dumps(data).encode()
```

**Problem**: Gleich wie Ansatz 1 - der Bluesky-Client umgeht das eigene AppView komplett.

**Nutzen**: Funktioniert nur für eigene Clients, die direkt das eigene AppView ansprechen.

### 3. birthDate auf Bluesky setzen (empfohlene Lösung)

**Idee**: Nach Account-Erstellung automatisch `putPreferences` auf Bluesky's AppView aufrufen.

**Konfiguration**:
```yaml
PDS_BSKY_APP_VIEW_URL: "https://api.bsky.app"
PDS_BSKY_APP_VIEW_DID: "did:web:api.bsky.app"
```

**Flow**:
1. Account auf eigenem PDS erstellen
2. Mit den frischen Credentials `app.bsky.actor.putPreferences` auf Bluesky aufrufen
3. birthDate wird auf Bluesky's AppView gespeichert
4. Bluesky-Client findet birthDate bei späteren Logins

**Vorteile**:
- Funktioniert mit dem offiziellen Bluesky-Client
- Account-Daten bleiben auf eigenem PDS
- Einmalige Aktion bei Account-Erstellung

**Nachteile**:
- birthDate-Preference liegt auf Bluesky's Infrastruktur
- Abhängigkeit von Bluesky für diese eine Preference

## Vergleich der Optionen

| Aspekt | Eigenes AppView | birthDate auf Bluesky |
|--------|-----------------|----------------------|
| Bluesky-Client kompatibel | Nein | Ja |
| Account-Daten | Eigener PDS | Eigener PDS |
| birthDate-Speicherort | Eigenes AppView | Bluesky AppView |
| Unabhängigkeit | Hoch (aber inkompatibel) | Mittel |
| Implementierung | Komplex | Einfach |

## Empfehlung

**Für maximale Kompatibilität mit Bluesky**: Option 3 (birthDate auf Bluesky setzen)

- Account-Daten (DID, Handle, Posts, etc.) bleiben vollständig auf dem eigenen PDS
- Nur die birthDate-Preference wird auf Bluesky gespeichert
- Volle Kompatibilität mit dem offiziellen Bluesky-Client

**Für maximale Unabhängigkeit**: Eigenen Client entwickeln

- Eigenes AppView mit lokaler Preferences-Speicherung
- Kein Support für den offiziellen Bluesky-Client
- Volle Kontrolle über alle Daten

## Technische Details

### Relevante Endpoints

- `com.atproto.server.createAccount` - Account erstellen (akzeptiert birthDate, speichert es aber nicht)
- `app.bsky.actor.getPreferences` - Preferences abrufen (inkl. birthDate)
- `app.bsky.actor.putPreferences` - Preferences setzen (birthDate hier speichern)

### PDS-Konfiguration

```yaml
# Für Bluesky-Kompatibilität:
PDS_BSKY_APP_VIEW_URL: "https://api.bsky.app"
PDS_BSKY_APP_VIEW_DID: "did:web:api.bsky.app"

# Für eigenes AppView (inkompatibel mit Bluesky-Client):
PDS_BSKY_APP_VIEW_URL: "https://app.poltr.info"
PDS_BSKY_APP_VIEW_DID: "did:web:app.poltr.info"
```

### birthDate-Format

```json
{
  "$type": "app.bsky.actor.defs#personalDetailsPref",
  "birthDate": "1970-01-01T00:00:00.000Z"
}
```

**Wichtig:** Bluesky verwendet `personalDetailsPref`, nicht `birthDate` als Typ!

## Offene Fragen

1. Könnte Bluesky den `atproto-proxy` Header konfigurierbar machen?
2. Gibt es eine Möglichkeit, DID-Resolution für `did:web:api.bsky.app` umzuleiten?
3. Wird ATProto in Zukunft eine dezentralere Preferences-Speicherung unterstützen?

---

*Dokumentiert am 2026-01-29*
