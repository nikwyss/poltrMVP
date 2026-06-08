-- Migration: Top-down Themen-Hierarchie (Arbeitsbaum).
-- Gegen die **appview**-Datenbank ausführen. Idempotent.
--
--   psql "$APPVIEW_POSTGRES_URL" -f infra/scripts/postgres/migrate-topics.sql
--
-- EIN stabiler Baum PRO BALLOT: er mutiert inkrementell (neue Argumente
-- einsortieren, Knoten nach-splitten). Veröffentlichte, eingefrorene Snapshots
-- gehen später separat nach ATProto — der Arbeitsbaum hier bleibt die mutierbare
-- Wahrheit. Siehe services/calculator/src/topdown.

-- 1) Themen-Knoten (Adjazenzliste: parent_id zeigt auf den Elternknoten).
CREATE TABLE IF NOT EXISTS app_topic_node (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ballot_rkey  text NOT NULL,
  parent_id    bigint REFERENCES app_topic_node(id) ON DELETE CASCADE,  -- NULL = Wurzel
  key          text,                  -- langlebiger Slug (mit '-'); set-once, für Permalinks
  name         text NOT NULL,
  description  text,
  depth        integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_topic_node ADD COLUMN IF NOT EXISTS key text;  -- Upgrade-Pfad
-- LLM-Prior: Wichtigkeit des Themas unter seinen Geschwistern (1–5, vom
-- propose-Schritt geschätzt; nur im CMS sichtbar, nicht im Frontend).
ALTER TABLE app_topic_node ADD COLUMN IF NOT EXISTS importance smallint
  CHECK (importance IS NULL OR importance BETWEEN 1 AND 5);
-- Voter-facing Einleitung: warum das Thema für die Stimmbürgerschaft von
-- Bedeutung ist und für wen. Getrennt von `description` (LLM-Klassifikation);
-- wird den Stimmbürger:innen im Frontend (Taxonomy-View) angezeigt.
ALTER TABLE app_topic_node ADD COLUMN IF NOT EXISTS introduction text;
CREATE INDEX IF NOT EXISTS app_topic_node_ballot_idx ON app_topic_node (ballot_rkey);
CREATE INDEX IF NOT EXISTS app_topic_node_parent_idx ON app_topic_node (parent_id);
CREATE UNIQUE INDEX IF NOT EXISTS app_topic_node_key_uidx
  ON app_topic_node (ballot_rkey, key) WHERE key IS NOT NULL;

-- 2) Zuordnung ARGUMENT → Knoten. Einheit = Argument: jedes Argument hängt an
--    GENAU EINEM Knoten. `confidence` = Klassifikator-Sicherheit 1–5 (oder NULL;
--    gleiche Skala wie die Node-Importance). `stance` = app_arguments.type
--    (PRO/CONTRA, keine semantische Analyse). `code` ist vestigial (ungenutzt).
CREATE TABLE IF NOT EXISTS app_topic_membership (
  ballot_rkey  text NOT NULL,
  node_id      bigint NOT NULL REFERENCES app_topic_node(id) ON DELETE CASCADE,
  argument_uri text NOT NULL,
  confidence   smallint,
  stance       text CHECK (stance IN ('pro','contra')),
  code         text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ballot_rkey, argument_uri, node_id)
);

-- Upgrade-Pfad (bestehende, argument-zentrierte DBs): die vestigiale is_primary-
-- Spalte (immer true) + ihren Primär-Index entfernen. Vorher etwaige Nebenthema-
-- Zeilen (is_primary=false) löschen, damit „ein Knoten pro Argument" erfüllbar ist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'app_topic_membership' AND column_name = 'is_primary') THEN
    DELETE FROM app_topic_membership WHERE is_primary = false;
    ALTER TABLE app_topic_membership DROP COLUMN is_primary;
  END IF;
END $$;
DROP INDEX IF EXISTS app_topic_membership_primary_uidx;
DROP INDEX IF EXISTS app_topic_membership_arg_idx;  -- ersetzt durch das Unique unten

-- confidence real → smallint (war durchgehend NULL) + 1–5-Check (idempotent).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'app_topic_membership'
               AND column_name = 'confidence' AND data_type = 'real') THEN
    ALTER TABLE app_topic_membership
      ALTER COLUMN confidence TYPE smallint USING round(confidence)::smallint;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'app_topic_membership_confidence_chk') THEN
    ALTER TABLE app_topic_membership
      ADD CONSTRAINT app_topic_membership_confidence_chk
      CHECK (confidence IS NULL OR confidence BETWEEN 1 AND 5);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS app_topic_membership_node_idx ON app_topic_membership (node_id);
-- Genau EIN Knoten pro Argument (DB-seitig garantiert).
CREATE UNIQUE INDEX IF NOT EXISTS app_topic_membership_arg_uidx
  ON app_topic_membership (ballot_rkey, argument_uri);

-- Grants für die calculator-Rolle (RW; baut + sortiert ein).
GRANT SELECT, INSERT, UPDATE, DELETE ON
  app_topic_node, app_topic_membership
  TO calculator;
