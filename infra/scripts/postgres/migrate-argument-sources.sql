-- Migration: Add source columns to app_arguments
-- Run against an existing appview database.
-- Idempotent: safe to run multiple times.
--
-- Adds support for three argument sources:
--   - 'user':         User-submitted arguments (existing behaviour)
--   - 'official':     Arguments from the Bundeskanzlei leaflet (curated via CMS)
--   - 'organization': Arguments from parties/associations/NGOs (schema reserved,
--                     not yet wired up — keys are nullable for now)

-- =============================================================================
-- 1. Add columns
-- =============================================================================

ALTER TABLE app_arguments
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'user'
    CHECK (source_type IN ('user', 'official', 'organization'));

ALTER TABLE app_arguments
  ADD COLUMN IF NOT EXISTS source_org_key text;

ALTER TABLE app_arguments
  ADD COLUMN IF NOT EXISTS source_doc_ref text;

ALTER TABLE app_arguments
  ADD COLUMN IF NOT EXISTS source_section text;

ALTER TABLE app_arguments
  ADD COLUMN IF NOT EXISTS source_verified_did text;

CREATE INDEX IF NOT EXISTS app_arguments_source_type_idx
  ON app_arguments (source_type);

CREATE INDEX IF NOT EXISTS app_arguments_source_org_key_idx
  ON app_arguments (source_org_key)
  WHERE source_org_key IS NOT NULL;

-- =============================================================================
-- 2. Relax author_did and add a consistency check
-- =============================================================================
--   - user:         author_did is required
--   - official:     no org_key, no author_did required
--   - organization: org_key required

ALTER TABLE app_arguments ALTER COLUMN author_did DROP NOT NULL;

-- Drop pre-existing version of the constraint, then recreate.
ALTER TABLE app_arguments DROP CONSTRAINT IF EXISTS app_arguments_source_consistency;

ALTER TABLE app_arguments ADD CONSTRAINT app_arguments_source_consistency CHECK (
  (source_type = 'user'         AND author_did IS NOT NULL) OR
  (source_type = 'official'     AND source_org_key IS NULL) OR
  (source_type = 'organization' AND source_org_key IS NOT NULL)
);
