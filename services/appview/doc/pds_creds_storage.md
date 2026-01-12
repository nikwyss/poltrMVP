# magic link auth requires that passwords of each user is stored encrypted in a own table: 

# 1) Konzept

Ein globaler Master-Key (32 bytes) liegt als Secret (K8s Secret / env var).

Pro User speicherst du nur:

ciphertext (enthält i.d.R. auch MAC)

nonce

Du verschlüsselst das Backend-App-Passwort (poltr-backend-primary) direkt mit dem Master-Key (AEAD).

Kein per-user DEK, kein KMS.

# 2) DB Schema (minimal)

users (oder pds_creds):

did (unique)

handle

pds_url

app_pw_ciphertext (bytea)

app_pw_nonce (bytea) (24 bytes bei XChaCha20-Poly1305)

created_at, updated_at

Optional:

app_pw_key_version (int) falls du später Key-Rotation machst.

# 3) Master-Key Handling

Generiere einmalig einen 32-byte Key (Base64).

Speichere ihn als Secret, z.B. POLTR_MASTER_KEY_B64.

Zugriff nur für den Auth-Service.

Rotation: wenn du rotieren willst, nutze key_version + unterstütze 2 Keys parallel (current + previous).


# SQL
```
CREATE TABLE pds_creds (
    did TEXT PRIMARY KEY,
    
    handle TEXT NOT NULL,
    email TEXT NOT NULL,
    pds_url TEXT NOT NULL,
    app_pw_ciphertext BYTEA NOT NULL,
    app_pw_nonce BYTEA NOT NULL CHECK (octet_length(app_pw_nonce) = 24),
    app_pw_key_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

);

-- Optional: schnelle Suche nach Handle
CREATE UNIQUE INDEX pds_creds_handle_idx ON pds_creds (handle);
CREATE UNIQUE INDEX pds_creds_email_idx ON pds_creds (email);

-- Optional: updated_at automatisch pflegen
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pds_creds_set_updated_at
BEFORE UPDATE ON pds_creds
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
```