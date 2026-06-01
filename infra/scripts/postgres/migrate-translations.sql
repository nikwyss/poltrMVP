-- Translation support for app_arguments and app_comments.
--
-- Arguments use inline translations (translations JSONB on the row), because
-- they live in the ballot's governance account where POLTR has write access.
--
-- Comments use SIDECAR records (app_comment_translations) because their
-- originals live in foreign repos (user repos / Bluesky) — POLTR must not
-- write into those.
--
-- Idempotent: safe to re-run.
-- See doc/RECORD_TRANSLATIONS.md for design details.

BEGIN;

-- ---------------------------------------------------------------------------
-- Arguments — inline translations
-- ---------------------------------------------------------------------------

ALTER TABLE app_arguments
  ADD COLUMN IF NOT EXISTS langs              text[] NOT NULL DEFAULT ARRAY['de'],
  ADD COLUMN IF NOT EXISTS translations       jsonb  NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS translation_status text   NOT NULL DEFAULT 'pending';

DO $$ BEGIN
  ALTER TABLE app_arguments
    ADD CONSTRAINT app_arguments_translation_status_check
    CHECK (translation_status IN ('pending', 'partial', 'complete', 'manual_only'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS app_arguments_translation_status_idx
  ON app_arguments (translation_status)
  WHERE NOT deleted AND translation_status IN ('pending', 'partial');

CREATE INDEX IF NOT EXISTS app_arguments_langs_idx
  ON app_arguments USING GIN (langs);

-- ---------------------------------------------------------------------------
-- Comments — sidecar translations, NO inline JSONB on the row
-- ---------------------------------------------------------------------------

ALTER TABLE app_comments
  ADD COLUMN IF NOT EXISTS langs              text[] NOT NULL DEFAULT ARRAY['de'],
  ADD COLUMN IF NOT EXISTS translation_status text   NOT NULL DEFAULT 'pending';

-- Drop any inline-translations column that previous (rejected) migration drafts
-- may have introduced. Comments are SIDECAR-only.
ALTER TABLE app_comments DROP COLUMN IF EXISTS translations;

DO $$ BEGIN
  ALTER TABLE app_comments
    ADD CONSTRAINT app_comments_translation_status_check
    CHECK (translation_status IN ('pending', 'partial', 'complete', 'manual_only'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS app_comments_translation_status_idx
  ON app_comments (translation_status)
  WHERE NOT deleted AND translation_status IN ('pending', 'partial');

CREATE INDEX IF NOT EXISTS app_comments_langs_idx
  ON app_comments USING GIN (langs);

-- Sidecar table.
CREATE TABLE IF NOT EXISTS app_comment_translations (
  uri           text PRIMARY KEY,
  cid           text NOT NULL,
  subject_uri   text NOT NULL,
  ballot_rkey   text,
  lang          text NOT NULL,
  body          text NOT NULL,
  source        text NOT NULL CHECK (source IN ('manual', 'ai')),
  model         text,
  translated_at timestamptz NOT NULL,
  indexed_at    timestamptz NOT NULL DEFAULT now(),
  deleted       boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS app_comment_translations_subject_lang_uniq
  ON app_comment_translations (subject_uri, lang) WHERE NOT deleted;
CREATE INDEX IF NOT EXISTS app_comment_translations_subject_idx
  ON app_comment_translations (subject_uri) WHERE NOT deleted;
CREATE INDEX IF NOT EXISTS app_comment_translations_ballot_rkey_idx
  ON app_comment_translations (ballot_rkey) WHERE NOT deleted;

COMMIT;
