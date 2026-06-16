-- =============================================================================
-- add-acceptance-pipeline.sql — Live-Migration: Phase-3-Schema der ATProto-native
-- Akzeptanz-Pipeline.
--
-- Idempotent (CREATE … IF NOT EXISTS, ADD COLUMN IF NOT EXISTS). Als SUPERUSER
-- (allforone) gegen die appview-DB:
--   psql "postgresql://allforone:<pw>@<host>:5432/appview" -f add-acceptance-pipeline.sql
--
-- Voraussetzung für das Einschalten der Pipeline-Flags (APPVIEW_ARGS_USER_REPO_ENABLED
-- / APPVIEW_RESPONSES_USER_REPO_ENABLED / ACCEPTANCE_PIPELINE_ENABLED). Reines
-- Schema — ohne die Flags ändert sich nichts.
-- =============================================================================

-- Herkunfts-Spalten (Provenienz auf das user-signierte Original).
ALTER TABLE app_arguments
  ADD COLUMN IF NOT EXISTS origin_uri text,
  ADD COLUMN IF NOT EXISTS origin_cid text;

ALTER TABLE app_peerreview_responses
  ADD COLUMN IF NOT EXISTS origin_uri text,
  ADD COLUMN IF NOT EXISTS origin_cid text;

-- Akzeptanz-Queue: Projektor→Writer-Handoff + Reconcile-Log (siehe db-setup.sql).
CREATE TABLE IF NOT EXISTS app_acceptance_queue (
  id          bigserial PRIMARY KEY,
  user_uri    text NOT NULL UNIQUE,
  user_cid    text NOT NULL,
  did         text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('argument', 'response', 'request')),
  ballot      text,
  status      text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'done', 'rejected')),
  reason      text,
  record      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_acceptance_queue_pending_idx
  ON app_acceptance_queue (created_at) WHERE status = 'pending';

-- Grants auf die NEUE Tabelle (greifen nicht rückwirkend über GRANT ON ALL TABLES;
-- daher explizit). Nur an Rollen, die existieren — reihenfolge-unabhängig zu
-- add-pod-roles.sql. Projektor (indexer) inserted; Writer pollt/aktualisiert.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'indexer') THEN
    GRANT SELECT, INSERT, UPDATE ON app_acceptance_queue TO indexer;
    GRANT USAGE, SELECT ON SEQUENCE app_acceptance_queue_id_seq TO indexer;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'writer') THEN
    GRANT SELECT, INSERT, UPDATE ON app_acceptance_queue TO writer;
    GRANT USAGE, SELECT ON SEQUENCE app_acceptance_queue_id_seq TO writer;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'appview') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app_acceptance_queue TO appview;
    GRANT USAGE, SELECT ON SEQUENCE app_acceptance_queue_id_seq TO appview;
  END IF;
END
$$;
