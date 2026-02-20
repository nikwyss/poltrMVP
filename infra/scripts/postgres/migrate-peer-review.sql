-- Migration: Add peer-review support
-- Run against an existing appview database.
-- Idempotent: safe to run multiple times.

-- =============================================================================
-- 1. Add columns to app_arguments
-- =============================================================================

ALTER TABLE app_arguments
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'preliminary'
    CHECK (review_status IN ('preliminary', 'approved', 'rejected'));

ALTER TABLE app_arguments
  ADD COLUMN IF NOT EXISTS original_uri text;

ALTER TABLE app_arguments
  ADD COLUMN IF NOT EXISTS governance_uri text;

CREATE INDEX IF NOT EXISTS app_arguments_review_status_idx
  ON app_arguments (review_status);

-- Existing imported arguments should be treated as approved (seed data)
UPDATE app_arguments SET review_status = 'approved' WHERE review_status = 'preliminary';

-- =============================================================================
-- 2. Create app_review_invitations
-- =============================================================================

CREATE TABLE IF NOT EXISTS app_review_invitations (
  uri           text PRIMARY KEY,
  cid           text NOT NULL,
  argument_uri  text NOT NULL,
  invitee_did   text NOT NULL,
  created_at    timestamptz NOT NULL,
  indexed_at    timestamptz NOT NULL DEFAULT now(),
  deleted       boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS app_review_invitations_arg_invitee_uniq
  ON app_review_invitations (argument_uri, invitee_did) WHERE NOT deleted;
CREATE INDEX IF NOT EXISTS app_review_invitations_argument_uri_idx
  ON app_review_invitations (argument_uri);
CREATE INDEX IF NOT EXISTS app_review_invitations_invitee_did_idx
  ON app_review_invitations (invitee_did);

-- =============================================================================
-- 3. Create app_review_responses
-- =============================================================================

CREATE TABLE IF NOT EXISTS app_review_responses (
  uri           text PRIMARY KEY,
  cid           text NOT NULL,
  argument_uri  text NOT NULL,
  reviewer_did  text NOT NULL,
  criteria      jsonb,
  vote          text NOT NULL CHECK (vote IN ('APPROVE', 'REJECT')),
  justification text,
  created_at    timestamptz NOT NULL,
  indexed_at    timestamptz NOT NULL DEFAULT now(),
  deleted       boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS app_review_responses_arg_reviewer_uniq
  ON app_review_responses (argument_uri, reviewer_did) WHERE NOT deleted;
CREATE INDEX IF NOT EXISTS app_review_responses_argument_uri_idx
  ON app_review_responses (argument_uri);
CREATE INDEX IF NOT EXISTS app_review_responses_reviewer_did_idx
  ON app_review_responses (reviewer_did);

-- =============================================================================
-- 4. Grants (indexer needs access to new tables)
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON app_review_invitations TO indexer;
GRANT SELECT, INSERT, UPDATE ON app_review_responses TO indexer;
