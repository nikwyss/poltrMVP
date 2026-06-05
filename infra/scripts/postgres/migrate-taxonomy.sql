-- Migration: Taxonomie-Persistenz (Achsen / Bündel / Zugehörigkeiten).
-- Gegen die **appview**-Datenbank ausführen. Idempotent.
--
--   psql "$APPVIEW_POSTGRES_URL" -f infra/scripts/postgres/migrate-taxonomy.sql
--
-- Schreibt der Calculator nach jedem /induce-batch-Lauf. Versioniert: jeder
-- Lauf = ein neuer Run; die „aktuelle" Taxonomie eines Ballots = der jüngste
-- Run. Siehe services/calculator + doc/argument_clustering.md.

-- 1) Ein Lauf = eine versionierte Taxonomie für einen Ballot.
--    Die stage0_*/prebundle_*-Spalten sind Lauf-weite Qualitätsindikatoren
--    (Stage 0 Häufigkeitsfilter + Stage 1 Vorbündelung), s. batch_induce-Output.
CREATE TABLE IF NOT EXISTS app_taxonomy_run (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ballot_rkey text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  axial_model text,
  code_count  integer,
  bundled     boolean,
  stage0_applied        boolean,   -- wurde der Häufigkeitsfilter angewandt (sonst Guard)
  stage0_min_frequency  integer,
  stage0_kept           integer,   -- Codes nach Filter (axialer Input)
  stage0_margin         integer,   -- seltene Codes im Rand-Topf
  prebundle_backend     text,      -- embedding | lexical | none
  prebundle_target      integer,   -- Ziel-Bündelzahl (harter Cap)
  prebundle_rounds      integer,   -- Lockerungs-Runden (embedding)
  prebundle_final_floor real,      -- final genutzter Floor (niedrig = erzwungen)
  prebundle_capped      boolean,   -- Cap durch Lockerung erreicht
  prebundle_max_size    integer,   -- Größen-Cap pro Bündel
  prebundle_max_bundle  integer,   -- tatsächlich größtes Bündel
  arguments_total       integer,   -- codierte Argumente in diesem Lauf
  arguments_unassigned  integer    -- davon KEINER Achse zugeordnet (nur Rand/ungrouped) — Qualitätsmerkmal
);
CREATE INDEX IF NOT EXISTS app_taxonomy_run_ballot_idx
  ON app_taxonomy_run (ballot_rkey, created_at DESC);

-- 2) Finale Achsen (+ Spezialknoten 'margin' = Rand, 'ungrouped' = Nicht gruppiert).
--    Die *_count-Spalten sind denormalisierte Qualitätsmetriken (beim Schreiben
--    aus der Membership-/Bündel-Tabelle berechnet, s. persist_taxonomy).
CREATE TABLE IF NOT EXISTS app_taxonomy_axis (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id         bigint NOT NULL REFERENCES app_taxonomy_run(id) ON DELETE CASCADE,
  label          text NOT NULL,
  description    text,
  pole_a         text,
  pole_b         text,
  kind           text NOT NULL DEFAULT 'axis'
    CHECK (kind IN ('axis', 'margin', 'ungrouped')),
  bundle_count   integer NOT NULL DEFAULT 0,  -- # Bündel dieser Achse
  argument_count integer NOT NULL DEFAULT 0,  -- # distinct Argumente (Membership)
  code_count     integer NOT NULL DEFAULT 0,  -- # distinct Codes (Membership)
  pro_share      real                         -- Anteil PRO unter den Argumenten der Achse (0..1, NULL wenn keine)
);
CREATE INDEX IF NOT EXISTS app_taxonomy_axis_run_idx ON app_taxonomy_axis (run_id);

-- 3) Zwischen-Bündel (Prebundle-Resultat); jedes hängt an einer Achse.
CREATE TABLE IF NOT EXISTS app_taxonomy_bundle (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id         bigint NOT NULL REFERENCES app_taxonomy_run(id) ON DELETE CASCADE,
  axis_id        bigint NOT NULL REFERENCES app_taxonomy_axis(id) ON DELETE CASCADE,
  representative text NOT NULL,
  code_count     integer NOT NULL DEFAULT 0,  -- # distinct Codes (Membership)
  cohesion       real,                        -- mittlere paarweise Ähnlichkeit der Member (NULL bei Singleton)
  avg_confidence real                         -- Ø Open-Coding-Confidence der Member
);
CREATE INDEX IF NOT EXISTS app_taxonomy_bundle_run_idx ON app_taxonomy_bundle (run_id);

-- Upgrade-Pfad für bereits bestehende Tabellen (Spalten nachziehen).
ALTER TABLE app_taxonomy_axis   ADD COLUMN IF NOT EXISTS bundle_count   integer NOT NULL DEFAULT 0;
ALTER TABLE app_taxonomy_axis   ADD COLUMN IF NOT EXISTS argument_count integer NOT NULL DEFAULT 0;
ALTER TABLE app_taxonomy_axis   ADD COLUMN IF NOT EXISTS code_count     integer NOT NULL DEFAULT 0;
ALTER TABLE app_taxonomy_axis   ADD COLUMN IF NOT EXISTS pro_share      real;
ALTER TABLE app_taxonomy_bundle ADD COLUMN IF NOT EXISTS code_count     integer NOT NULL DEFAULT 0;
ALTER TABLE app_taxonomy_bundle ADD COLUMN IF NOT EXISTS cohesion       real;
ALTER TABLE app_taxonomy_bundle ADD COLUMN IF NOT EXISTS avg_confidence real;
ALTER TABLE app_taxonomy_run    ADD COLUMN IF NOT EXISTS stage0_applied        boolean;
ALTER TABLE app_taxonomy_run    ADD COLUMN IF NOT EXISTS stage0_min_frequency  integer;
ALTER TABLE app_taxonomy_run    ADD COLUMN IF NOT EXISTS stage0_kept           integer;
ALTER TABLE app_taxonomy_run    ADD COLUMN IF NOT EXISTS stage0_margin         integer;
ALTER TABLE app_taxonomy_run    ADD COLUMN IF NOT EXISTS prebundle_backend     text;
ALTER TABLE app_taxonomy_run    ADD COLUMN IF NOT EXISTS prebundle_target      integer;
ALTER TABLE app_taxonomy_run    ADD COLUMN IF NOT EXISTS prebundle_rounds      integer;
ALTER TABLE app_taxonomy_run    ADD COLUMN IF NOT EXISTS prebundle_final_floor real;
ALTER TABLE app_taxonomy_run    ADD COLUMN IF NOT EXISTS prebundle_capped      boolean;
ALTER TABLE app_taxonomy_run    ADD COLUMN IF NOT EXISTS prebundle_max_size    integer;
ALTER TABLE app_taxonomy_run    ADD COLUMN IF NOT EXISTS prebundle_max_bundle  integer;
ALTER TABLE app_taxonomy_run    ADD COLUMN IF NOT EXISTS arguments_total       integer;
ALTER TABLE app_taxonomy_run    ADD COLUMN IF NOT EXISTS arguments_unassigned  integer;

-- 4) Faktentabelle: pro (Argument, Code) → Bündel (optional, NULL für Rand) → Achse.
--    Alle 4 Beziehungen fallen hieraus per DISTINCT/Join.
CREATE TABLE IF NOT EXISTS app_taxonomy_membership (
  run_id       bigint NOT NULL REFERENCES app_taxonomy_run(id) ON DELETE CASCADE,
  argument_uri text NOT NULL,
  code         text NOT NULL,
  bundle_id    bigint REFERENCES app_taxonomy_bundle(id) ON DELETE CASCADE,
  axis_id      bigint NOT NULL REFERENCES app_taxonomy_axis(id) ON DELETE CASCADE,
  pole         text CHECK (pole IN ('a','b','neutral')),  -- Pol-Neigung des Codes
  stance       text CHECK (stance IN ('pro','contra')),   -- Haltung des Arguments (app_arguments.type)
  confidence   real,                                      -- Open-Coding-Confidence dieses Codes (0..1)
  PRIMARY KEY (run_id, argument_uri, code)
);
CREATE INDEX IF NOT EXISTS app_taxonomy_membership_axis_idx   ON app_taxonomy_membership (run_id, axis_id);
CREATE INDEX IF NOT EXISTS app_taxonomy_membership_bundle_idx ON app_taxonomy_membership (run_id, bundle_id);
CREATE INDEX IF NOT EXISTS app_taxonomy_membership_arg_idx    ON app_taxonomy_membership (run_id, argument_uri);

-- Upgrade-Pfad: `pole` kam nach der ersten Tabellen-Version dazu (bestehende
-- Membership-Tabellen haben sie sonst nicht; CREATE TABLE IF NOT EXISTS zieht
-- keine neuen Spalten nach).
ALTER TABLE app_taxonomy_membership
  ADD COLUMN IF NOT EXISTS pole text CHECK (pole IN ('a','b','neutral'));
ALTER TABLE app_taxonomy_membership
  ADD COLUMN IF NOT EXISTS stance text CHECK (stance IN ('pro','contra'));
ALTER TABLE app_taxonomy_membership
  ADD COLUMN IF NOT EXISTS confidence real;

-- 5) Rollup Argument → Achse (analog app_argument_open_codes, aber je Lauf).
--    Aus der Membership aggregiert; der Pol (spricht das Argument fürs a- oder
--    b-Ende?) wird aus den Code-Polen abgeleitet — KEIN neuer LLM-Call.
CREATE TABLE IF NOT EXISTS app_arguments_axis (
  run_id       bigint NOT NULL REFERENCES app_taxonomy_run(id) ON DELETE CASCADE,
  argument_uri text NOT NULL,
  axis_id      bigint NOT NULL REFERENCES app_taxonomy_axis(id) ON DELETE CASCADE,
  pole         text CHECK (pole IN ('a','b','neutral')),  -- spricht das Argument fürs a- oder b-Ende?
  stance       text CHECK (stance IN ('pro','contra')),   -- Haltung des Arguments zur Vorlage
  code_count   integer NOT NULL DEFAULT 0,                -- # Codes des Arguments auf dieser Achse
  confidence   real,                                      -- Ø Confidence dieser Codes
  conflict     boolean NOT NULL DEFAULT false,            -- Codes ziehen auf a UND b (§10.2 „faul")
  PRIMARY KEY (run_id, argument_uri, axis_id)
);
CREATE INDEX IF NOT EXISTS app_arguments_axis_arg_idx  ON app_arguments_axis (run_id, argument_uri);
CREATE INDEX IF NOT EXISTS app_arguments_axis_axis_idx ON app_arguments_axis (run_id, axis_id);

-- Grants für die calculator-Rolle (RW; Identity-Spalten brauchen keine Sequenz-Grants).
GRANT SELECT, INSERT, UPDATE, DELETE ON
  app_taxonomy_run, app_taxonomy_axis, app_taxonomy_bundle, app_taxonomy_membership,
  app_arguments_axis
  TO calculator;
