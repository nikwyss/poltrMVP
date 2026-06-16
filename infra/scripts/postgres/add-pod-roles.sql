-- =============================================================================
-- add-pod-roles.sql — Live-Migration: eigene DB-Rollen für appview + writer
--
-- Löst die beiden letzten Pods aus der geteilten allforone-Superuser-Rolle:
-- jeder Pod bekommt einen eigenen, nicht-superuser DB-User. Danach nutzt KEIN
-- Pod mehr allforone (→ reiner Break-Glass-/DBA-Account).
--
-- Idempotent. Als SUPERUSER gegen die appview-DB ausführen. Passwörter werden
-- zur LAUFZEIT via -v injiziert (keine Secrets in dieser getrackten Datei):
--   psql "postgresql://allforone:<pw>@<host>:5432/appview" \
--     -v appview_pw="'<APPVIEW_PW>'" -v writer_pw="'<WRITER_PW>'" \
--     -f add-pod-roles.sql
-- (writer_pw MUSS dem writer-secret in secrets.yaml entsprechen.)
--
-- Danach: secrets.yaml auf appview@ / writer@ umstellen, Pods neu ausrollen.
-- =============================================================================

\if :{?appview_pw}
\else
  \echo '>>> FEHLER: -v appview_pw=... fehlt (z.B. -v appview_pw="''<pw>''")'
  \quit 1
\endif
\if :{?writer_pw}
\else
  \echo '>>> FEHLER: -v writer_pw=... fehlt'
  \quit 1
\endif

-- Rollen anlegen (ohne Passwort-Literal — das setzt das ALTER unten via :var;
-- psql interpoliert :vars NICHT in dollar-quoted DO-Blöcken).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'appview') THEN
    CREATE ROLE appview WITH LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'writer') THEN
    CREATE ROLE writer WITH LOGIN;
  END IF;
END
$$;

ALTER ROLE appview WITH PASSWORD :appview_pw;
ALTER ROLE writer  WITH PASSWORD :writer_pw;

-- Eligibility-View muss existieren, bevor darauf gegrantet wird. Idempotent +
-- identisch zu db-setup.sql — fällt nicht um, falls die Phase-2-Migration noch
-- nicht separat angewandt wurde (macht dieses Skript selbstständig).
CREATE OR REPLACE VIEW auth.v_eligible_participants AS
  SELECT did, TRUE AS eligible
  FROM auth.auth_creds;

-- appview: volle DML auf beide Schemas, aber KEIN Superuser.
GRANT CONNECT ON DATABASE appview TO appview;
GRANT USAGE ON SCHEMA public TO appview;
GRANT USAGE ON SCHEMA auth   TO appview;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO appview;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth   TO appview;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO appview;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA auth   TO appview;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO appview;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth   GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO appview;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO appview;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth   GRANT USAGE, SELECT ON SEQUENCES TO appview;

-- writer: wie der Indexer auf public, PLUS pw-Spalten von governance_accounts.
GRANT CONNECT ON DATABASE appview TO writer;
GRANT USAGE ON SCHEMA public TO writer;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO writer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO writer;
GRANT USAGE ON SCHEMA auth TO writer;
GRANT SELECT ON auth.governance_accounts TO writer;       -- inkl. pw_ciphertext/pw_nonce
GRANT SELECT ON auth.v_eligible_participants TO writer;

-- Verifikation:
--   psql als 'appview' → SELECT auf auth.auth_creds ok; aber KEIN Superuser
--     (z.B. `SELECT * FROM pg_authid;` → permission denied).
--   psql als 'writer'  → SELECT pw_ciphertext FROM auth.governance_accounts ok;
--     SELECT FROM auth.auth_creds → permission denied (kein User-Identitäts-Zugriff).
