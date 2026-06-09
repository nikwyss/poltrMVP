-- Hand-crafted schema diff for Payload Localization.
--
-- The CMS DB was managed via Payload's dev-mode "push" so far (no
-- payload_migrations table tracking a baseline). When we tried
-- `payload migrate:create` it produced a from-scratch migration that
-- collides with the existing schema. This script applies only the diff
-- that the new code (services/cms/src/payload.config.ts + Collections)
-- expects.
--
-- Idempotent: re-runs safely thanks to IF NOT EXISTS / DO blocks.
--
-- Run it once against the CMS database (separate from the AppView DB):
--   psql "$CMS_DATABASE_URL" -f infra/scripts/cms-postgres/migrate-localization.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. New _locales enum (BCP-47 region-flavoured POLTR languages)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "_locales" AS ENUM ('de-CH','fr-CH','it-CH','rm','en-GB');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 2. originLanguage select fields (Ballots + OfficialArguments)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "enum_ballots_origin_language" AS ENUM ('de-CH','fr-CH','it-CH','rm','en-GB');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "enum_imported_arguments_origin_language" AS ENUM ('de-CH','fr-CH','it-CH','rm','en-GB');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "ballots"
  ADD COLUMN IF NOT EXISTS "origin_language" "enum_ballots_origin_language" DEFAULT 'de-CH' NOT NULL;

ALTER TABLE "imported_arguments"
  ADD COLUMN IF NOT EXISTS "origin_language" "enum_imported_arguments_origin_language" DEFAULT 'de-CH' NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Locales side-tables. Payload moves `localized: true` fields here:
--    one row per (parent, locale) pair.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ballots_locales" (
  "title"       varchar NOT NULL,
  "description" jsonb,
  "topic"       varchar,
  "id"          serial PRIMARY KEY NOT NULL,
  "_locale"     "_locales" NOT NULL,
  "_parent_id"  integer NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "ballots_locales"
    ADD CONSTRAINT "ballots_locales_parent_id_fk"
    FOREIGN KEY ("_parent_id") REFERENCES "ballots"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ballots_locales_locale_parent_id_unique"
  ON "ballots_locales" USING btree ("_locale","_parent_id");

CREATE TABLE IF NOT EXISTS "imported_arguments_locales" (
  "title"      varchar NOT NULL,
  "body"       varchar NOT NULL,
  "id"         serial PRIMARY KEY NOT NULL,
  "_locale"    "_locales" NOT NULL,
  "_parent_id" integer NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "imported_arguments_locales"
    ADD CONSTRAINT "imported_arguments_locales_parent_id_fk"
    FOREIGN KEY ("_parent_id") REFERENCES "imported_arguments"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "imported_arguments_locales_locale_parent_id_unique"
  ON "imported_arguments_locales" USING btree ("_locale","_parent_id");

-- ---------------------------------------------------------------------------
-- 4. Data migration: copy existing monolingual values into the locale slot
--    derived from the row's previous language (default 'de').
--    Idempotent via the NOT EXISTS clause.
-- ---------------------------------------------------------------------------

-- Ballots: legacy `ballots.language` column may still exist as enum_ballots_language.
-- Fall back to 'de' if the column is gone or the value doesn't match a supported locale.
INSERT INTO "ballots_locales" ("title", "description", "topic", "_locale", "_parent_id")
SELECT
  b.title,
  b.description,
  b.topic,
  CASE to_jsonb(b)->>'language'
    WHEN 'de' THEN 'de-CH'::"_locales"
    WHEN 'fr' THEN 'fr-CH'::"_locales"
    WHEN 'it' THEN 'it-CH'::"_locales"
    WHEN 'rm' THEN 'rm'::"_locales"
    WHEN 'en' THEN 'en-GB'::"_locales"
    ELSE 'de-CH'::"_locales"
  END,
  b.id
FROM "ballots" b
WHERE NOT EXISTS (
  SELECT 1 FROM "ballots_locales" bl
  WHERE bl."_parent_id" = b.id
);

-- OfficialArguments: no prior per-row language hint → default to 'de'.
INSERT INTO "imported_arguments_locales" ("title", "body", "_locale", "_parent_id")
SELECT
  a.title,
  a.body,
  'de-CH'::"_locales",
  a.id
FROM "imported_arguments" a
WHERE NOT EXISTS (
  SELECT 1 FROM "imported_arguments_locales" al
  WHERE al."_parent_id" = a.id
);

-- ---------------------------------------------------------------------------
-- 5. Drop legacy `language` column on ballots (was a select field; replaced
--    by `origin_language` + the Localization mechanism).
--    Safe-guard: only drop if it exists.
-- ---------------------------------------------------------------------------
ALTER TABLE "ballots" DROP COLUMN IF EXISTS "language";

-- Old enum becomes orphan; drop it if nothing references it anymore.
DO $$ BEGIN
  DROP TYPE "enum_ballots_language";
EXCEPTION WHEN undefined_object THEN NULL;
         WHEN dependent_objects_still_exist THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 6. NOTE: The legacy non-localized columns on `ballots` (title, description,
--    topic) and `imported_arguments` (title, body) stay in place for now —
--    Payload still reads them as a fallback when fallback-locale resolution
--    hits an empty locale slot. They can be dropped in a later cleanup once
--    every row has a populated locale slot. Doing it here would crash older
--    code paths that still SELECT them.
-- ---------------------------------------------------------------------------

COMMIT;
