# Ozone Moderation Account erstellen

Anleitung zum Erstellen eines Moderation-Accounts für Ozone auf dem Poltr PDS.

(wichtig: ozone.poltr.info geht nicht, (weils subdomain wir ja umgeleietet.))

## Voraussetzungen

- Zugang zum PDS Admin-Passwort (`PDS_ADMIN_PASSWORD`)
- Zugang zur Email-Adresse des neuen Accounts
- `kubectl` Zugang zum Cluster

## 1. Invite Code erstellen

```bash
curl -s -X POST "https://pds.poltr.info/xrpc/com.atproto.server.createInviteCode" \
  -H "Content-Type: application/json" \
  -u "admin:<PDS_ADMIN_PASSWORD>" \
  -d '{"useCount": 1}'
```

Response: `{"code":"pds-poltr-info-xxxxx-xxxxx"}`

## 2. Account erstellen

```bash
curl -s -X POST "https://pds.poltr.info/xrpc/com.atproto.server.createAccount" \
  -H "Content-Type: application/json" \
  -d '{
    "handle": "<handle>.poltr.info",
    "email": "<email>",
    "password": "<password>",
    "inviteCode": "<invite-code>"
  }'
```

Response enthält das neue `did` (z.B. `did:plc:abc123...`).

## 3. PLC Operation Signatur anfordern

Einloggen und Signatur anfordern:

```bash
# Session erstellen
RESPONSE=$(curl -s -X POST "https://pds.poltr.info/xrpc/com.atproto.server.createSession" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"<handle>.poltr.info","password":"<password>"}')

ACCESS_TOKEN=$(echo $RESPONSE | jq -r '.accessJwt')

# PLC Operation Signatur anfordern (sendet Email)
curl -s -X POST "https://pds.poltr.info/xrpc/com.atproto.identity.requestPlcOperationSignature" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Eine Email mit Bestätigungs-Token wird an die Account-Email gesendet.

## 4. Labeler Service zum DID hinzufügen

Mit dem Email-Token die PLC Operation signieren:

```bash
curl -s -X POST "https://pds.poltr.info/xrpc/com.atproto.identity.signPlcOperation" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "<EMAIL-TOKEN>",
    "services": {
      "atproto_pds": {"type":"AtprotoPersonalDataServer","endpoint":"https://pds.poltr.info"},
      "atproto_labeler": {"type":"AtprotoLabeler","endpoint":"https://ozone.poltr.info"}
    }
  }'
```

Response enthält die signierte Operation. Diese dann submitten:

```bash
curl -s -X POST "https://pds.poltr.info/xrpc/com.atproto.identity.submitPlcOperation" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": <signierte-operation-aus-vorherigem-schritt>
  }'
```

## 5. DID Dokument verifizieren

```bash
curl -s "https://plc.directory/<did>" | jq .
```

Sollte jetzt `#atproto_labeler` Service enthalten:

```json
{
  "service": [
    {"id": "#atproto_pds", "type": "AtprotoPersonalDataServer", "serviceEndpoint": "https://pds.poltr.info"},
    {"id": "#atproto_labeler", "type": "AtprotoLabeler", "serviceEndpoint": "https://ozone.poltr.info"}
  ]
}
```

## 6. Handle Resolution verifizieren

```bash
curl -s "https://<handle>.poltr.info/.well-known/atproto-did"
```

Sollte das DID zurückgeben.

## 7. Ozone konfigurieren

In `infra/kube/secrets.yaml` das neue DID setzen:

```yaml
OZONE_SERVER_DID: "<did>"
```

Apply und Restart:

```bash
kubectl apply -f infra/kube/secrets.yaml
kubectl rollout restart deployment/ozone -n poltr
```

## 8. Einloggen

Auf https://ozone.poltr.info mit dem neuen Account einloggen:
- Handle: `<handle>.poltr.info`
- Password: `<password>`

## Aktueller Moderation Account

| Feld | Wert |
|------|------|
| Handle | `moderation.poltr.info` |
| DID | `did:plc:5ecl3anpfxtmn2szxsm2mjhf` |
| Email | `dominik.wyss@velumount.ch` |

## Troubleshooting

### Handle zeigt "invalid"

1. Handle Resolution prüfen:
   ```bash
   curl -s "https://<handle>.poltr.info/.well-known/atproto-did"
   ```

2. Falls leer/Fehler: Ingress-Routing prüfen. Für Handles ohne spezifische Ingress-Rule greift das Wildcard-Routing zu PDS automatisch.

3. Falls spezifische Ingress-Rule existiert (z.B. für `ozone.poltr.info`), muss `.well-known/atproto-did` explizit zum PDS geroutet werden:
   ```yaml
   - host: ozone.poltr.info
     http:
       paths:
         - path: /.well-known/atproto-did
           pathType: ImplementationSpecific
           backend:
             service:
               name: pds
               port:
                 number: 80
         - path: /
           pathType: Prefix
           backend:
             service:
               name: ozone
               port:
                 number: 80
   ```

### Signing Key Mismatch

Falls Labels nicht signiert werden können, muss der `#atproto_label` Verification Key im DID mit dem `OZONE_SIGNING_KEY_HEX` übereinstimmen. Dies erfordert eine weitere PLC Operation um den Key zu registrieren.
