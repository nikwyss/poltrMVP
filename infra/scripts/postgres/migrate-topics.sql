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

-- 2) Zuordnung ARGUMENT → Knoten. Die Einheit ist das Argument (nicht mehr der
--    Open Code): jedes Argument hängt mit GEKAPPTER Multimembership an höchstens
--    zwei Knoten — einem Hauptthema (is_primary = true) und optional EINEM
--    Nebenthema (is_primary = false). `code` ist nur noch optionale Provenienz
--    (welcher Open Code die Zuordnung begründet hat), nicht mehr Teil des PK.
CREATE TABLE IF NOT EXISTS app_topic_membership (
  ballot_rkey  text NOT NULL,
  node_id      bigint NOT NULL REFERENCES app_topic_node(id) ON DELETE CASCADE,
  argument_uri text NOT NULL,
  is_primary   boolean NOT NULL DEFAULT true,  -- Haupt- vs. Nebenthema
  confidence   real,
  stance       text CHECK (stance IN ('pro','contra')),  -- Haltung des Arguments zur Vorlage
  code         text,                            -- optionale Provenienz (nullable)
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ballot_rkey, argument_uri, node_id)
);

-- Upgrade-Pfad: Tabelle bestand zuvor code-zentriert (PK …,code; code NOT NULL).
-- Nicht-destruktiv auf argument-zentriert migrieren — die (Argument,Knoten)-
-- Fakten bleiben erhalten, pro Argument wird ein Primärthema gewählt.
-- WICHTIG: ZUERST den PK swappen, DANN `code` nullable machen — `DROP NOT NULL`
-- auf einer PK-Spalte verweigert Postgres ("column is in a primary key").
ALTER TABLE app_topic_membership ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT true;
DO $$
BEGIN
  -- Nur umstellen, wenn der PK noch code enthält (alt: …,argument_uri,code).
  IF EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = 'app_topic_membership'::regclass AND i.indisprimary
      AND a.attname = 'code'
  ) THEN
    -- a) Duplikate (gleiches argument_uri+node_id über mehrere Codes) auf eine
    --    Zeile reduzieren — sonst kollidiert der neue PK.
    DELETE FROM app_topic_membership m USING app_topic_membership keep
     WHERE m.ballot_rkey = keep.ballot_rkey
       AND m.argument_uri = keep.argument_uri
       AND m.node_id = keep.node_id
       AND m.ctid > keep.ctid;
    -- b) Pro Argument genau EIN Primärthema (flachster Knoten gewinnt), Rest sekundär.
    UPDATE app_topic_membership m SET is_primary = false
     WHERE EXISTS (
       SELECT 1 FROM app_topic_membership o
       JOIN app_topic_node n  ON n.id  = o.node_id
       JOIN app_topic_node nm ON nm.id = m.node_id
       WHERE o.ballot_rkey = m.ballot_rkey AND o.argument_uri = m.argument_uri
         AND (n.depth, o.node_id) < (nm.depth, m.node_id)
     );
    -- c) PK auf (ballot_rkey, argument_uri, node_id) umstellen.
    ALTER TABLE app_topic_membership DROP CONSTRAINT app_topic_membership_pkey;
    ALTER TABLE app_topic_membership ADD PRIMARY KEY (ballot_rkey, argument_uri, node_id);
  END IF;
END $$;
-- Jetzt ist `code` nicht mehr Teil des PK → NOT NULL darf entfallen.
ALTER TABLE app_topic_membership ALTER COLUMN code DROP NOT NULL;

CREATE INDEX IF NOT EXISTS app_topic_membership_node_idx ON app_topic_membership (node_id);
CREATE INDEX IF NOT EXISTS app_topic_membership_arg_idx  ON app_topic_membership (ballot_rkey, argument_uri);
-- Genau EIN Primärthema pro Argument (DB-seitig garantiert; „max. 1 Sekundär"
-- erzwingt der Klassifikator).
CREATE UNIQUE INDEX IF NOT EXISTS app_topic_membership_primary_uidx
  ON app_topic_membership (ballot_rkey, argument_uri) WHERE is_primary;

-- Grants für die calculator-Rolle (RW; baut + sortiert ein).
GRANT SELECT, INSERT, UPDATE, DELETE ON
  app_topic_node, app_topic_membership
  TO calculator;
