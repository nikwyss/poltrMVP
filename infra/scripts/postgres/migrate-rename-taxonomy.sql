-- Migration: app_topic_* → app_taxonomy_*
--
-- Vereinheitlicht die Namensgebung der Taxonomie-Tabellen auf "taxonomy" — passend
-- zum Lexikon `app.ch.poltr.taxonomy.snapshot` / der XRPC-Methode `app.ch.poltr.taxonomy.get`
-- und der Serving-/UI-Schicht (taxonomy.py, TaxonomyPanel). Bislang trug nur die
-- DB-Storage-Ebene das abweichende Präfix `app_topic_`.
--
-- Für BEREITS DEPLOYTE DBs. Fresh-Setup verwendet die neuen Namen direkt (db-setup.sql).
-- Historische Migrationen (migrate-topics.sql, migrate-topic-translations.sql) bleiben
-- eingefroren — sie beschreiben den Stand VOR dieser Umbenennung.
--
-- Privilegien (GRANTs) sind an die Objekt-OID gebunden und überleben RENAME — kein
-- Re-Grant nötig. Trigger gehören zur Tabelle und feuern nach RENAME unverändert
-- weiter; ihre Umbenennung hier ist nur Kosmetik für Konsistenz.
--
-- Idempotent: über IF-EXISTS-Guards mehrfach ausführbar; No-op auf einer frisch via
-- db-setup.sql aufgesetzten DB (die schon app_taxonomy_* hat).

BEGIN;

-- 1) Tabellen ---------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.app_topic_node') IS NOT NULL THEN
    ALTER TABLE app_topic_node RENAME TO app_taxonomy_node;
  END IF;
  IF to_regclass('public.app_topic_membership') IS NOT NULL THEN
    ALTER TABLE app_topic_membership RENAME TO app_taxonomy_membership;
  END IF;
  IF to_regclass('public.app_topic_snapshot') IS NOT NULL THEN
    ALTER TABLE app_topic_snapshot RENAME TO app_taxonomy_snapshot;
  END IF;
END $$;

-- 2) Indexe -----------------------------------------------------------------
ALTER INDEX IF EXISTS app_topic_node_ballot_idx        RENAME TO app_taxonomy_node_ballot_idx;
ALTER INDEX IF EXISTS app_topic_node_parent_idx        RENAME TO app_taxonomy_node_parent_idx;
ALTER INDEX IF EXISTS app_topic_node_key_uidx          RENAME TO app_taxonomy_node_key_uidx;
ALTER INDEX IF EXISTS app_topic_node_tx_status_idx     RENAME TO app_taxonomy_node_tx_status_idx;
ALTER INDEX IF EXISTS app_topic_membership_node_idx    RENAME TO app_taxonomy_membership_node_idx;
ALTER INDEX IF EXISTS app_topic_membership_arg_uidx    RENAME TO app_taxonomy_membership_arg_uidx;
ALTER INDEX IF EXISTS app_topic_snapshot_ballot_idx    RENAME TO app_taxonomy_snapshot_ballot_idx;

-- 3) Trigger + Funktion -----------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'app_topic_node_reset_translations') THEN
    ALTER FUNCTION app_topic_node_reset_translations() RENAME TO app_taxonomy_node_reset_translations;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'app_topic_node_reset_translations_trg') THEN
    ALTER TRIGGER app_topic_node_reset_translations_trg ON app_taxonomy_node
      RENAME TO app_taxonomy_node_reset_translations_trg;
  END IF;
END $$;

-- 4) Explizit benannte Check-Constraints (Kosmetik) -------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_topic_node_translation_status_check') THEN
    ALTER TABLE app_taxonomy_node
      RENAME CONSTRAINT app_topic_node_translation_status_check
      TO app_taxonomy_node_translation_status_check;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_topic_membership_confidence_chk') THEN
    ALTER TABLE app_taxonomy_membership
      RENAME CONSTRAINT app_topic_membership_confidence_chk
      TO app_taxonomy_membership_confidence_chk;
  END IF;
END $$;

COMMIT;
