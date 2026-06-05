-- Migration: Top-down Themen-Hierarchie (Arbeitsbaum, parallel zu app_taxonomy_*).
-- Gegen die **appview**-Datenbank ausführen. Idempotent.
--
--   psql "$APPVIEW_POSTGRES_URL" -f infra/scripts/postgres/migrate-topics.sql
--
-- Anders als app_taxonomy_* (jeder Lauf = neue Version) ist dies EIN stabiler
-- Baum PRO BALLOT: er mutiert inkrementell (neue Argumente einsortieren, Knoten
-- nach-splitten). Veröffentlichte, eingefrorene Snapshots gehen später separat
-- nach ATProto — der Arbeitsbaum hier bleibt die mutierbare Wahrheit.
-- Siehe services/calculator/src/topdown + doc/argument_clustering.md.

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
CREATE INDEX IF NOT EXISTS app_topic_node_ballot_idx ON app_topic_node (ballot_rkey);
CREATE INDEX IF NOT EXISTS app_topic_node_parent_idx ON app_topic_node (parent_id);
CREATE UNIQUE INDEX IF NOT EXISTS app_topic_node_key_uidx
  ON app_topic_node (ballot_rkey, key) WHERE key IS NOT NULL;

-- 2) Zuordnung Code/Argument → Knoten. Ein Code hängt an GENAU EINEM Knoten
--    (dem tiefsten, in den er klassifiziert wurde). Ein Argument erscheint über
--    seine mehreren Codes an mehreren Knoten (Multi-Thema).
CREATE TABLE IF NOT EXISTS app_topic_membership (
  ballot_rkey  text NOT NULL,
  node_id      bigint NOT NULL REFERENCES app_topic_node(id) ON DELETE CASCADE,
  argument_uri text NOT NULL,
  code         text NOT NULL,
  confidence   real,
  stance       text CHECK (stance IN ('pro','contra')),  -- Haltung des Arguments zur Vorlage
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ballot_rkey, argument_uri, code)
);
CREATE INDEX IF NOT EXISTS app_topic_membership_node_idx ON app_topic_membership (node_id);
CREATE INDEX IF NOT EXISTS app_topic_membership_arg_idx  ON app_topic_membership (ballot_rkey, argument_uri);

-- Grants für die calculator-Rolle (RW; baut + sortiert ein).
GRANT SELECT, INSERT, UPDATE, DELETE ON
  app_topic_node, app_topic_membership
  TO calculator;
