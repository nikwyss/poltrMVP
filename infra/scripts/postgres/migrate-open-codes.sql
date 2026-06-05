-- Migration: Open-Coding-Tabelle für den Calculator-Service (Variante B Stage 1).
-- Idempotent. Siehe doc/argument_clustering.md §9 und services/calculator.
--
-- Anwenden:
--   psql "$APPVIEW_POSTGRES_URL" -f infra/scripts/postgres/migrate-open-codes.sql

CREATE TABLE IF NOT EXISTS app_argument_open_codes (
  argument_uri    text PRIMARY KEY REFERENCES app_arguments(uri) ON DELETE CASCADE,
  argument_cid    text NOT NULL,
  ballot_rkey     text NOT NULL,
  coder_signature text,
  codes           jsonb,
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','done','empty','failed','failed_permanent')),
  attempts        integer NOT NULL DEFAULT 0,
  last_error      text,
  claimed_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_argument_open_codes_status_idx
  ON app_argument_open_codes (status);
CREATE INDEX IF NOT EXISTS app_argument_open_codes_ballot_idx
  ON app_argument_open_codes (ballot_rkey);
CREATE INDEX IF NOT EXISTS app_argument_open_codes_updated_idx
  ON app_argument_open_codes (updated_at)
  WHERE status IN ('done','empty');

-- DB-Rolle für den Calculator (Passwort anpassen / via Secret setzen).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'calculator') THEN
    CREATE ROLE calculator WITH LOGIN PASSWORD 'CHANGE_ME';
  END IF;
END$$;
GRANT CONNECT ON DATABASE appview TO calculator;
GRANT USAGE ON SCHEMA public TO calculator;
GRANT SELECT ON app_arguments TO calculator;
GRANT SELECT, INSERT, UPDATE, DELETE ON app_argument_open_codes TO calculator;
REVOKE ALL ON SCHEMA auth FROM calculator;
