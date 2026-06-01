-- Migration: rename review → peerreview
-- Renames DB tables and column to match the peerreview naming convention used
-- everywhere else in the codebase. Idempotent via IF EXISTS / IF NOT EXISTS.
--
-- Run as superuser or the allforone role.

-- 1. Rename tables
ALTER TABLE IF EXISTS app_review_invitations  RENAME TO app_peerreview_invitations;
ALTER TABLE IF EXISTS app_review_responses    RENAME TO app_peerreview_responses;

-- 2. Rename indexes (Postgres renames constraint-backing indexes automatically
--    on table rename, but explicit indexes keep their old names).
ALTER INDEX IF EXISTS app_review_invitations_arg_invitee_uniq  RENAME TO app_peerreview_invitations_arg_invitee_uniq;
ALTER INDEX IF EXISTS app_review_invitations_argument_uri_idx  RENAME TO app_peerreview_invitations_argument_uri_idx;
ALTER INDEX IF EXISTS app_review_invitations_invitee_did_idx   RENAME TO app_peerreview_invitations_invitee_did_idx;
ALTER INDEX IF EXISTS app_review_invitations_checked_in_idx    RENAME TO app_peerreview_invitations_checked_in_idx;
ALTER INDEX IF EXISTS app_review_responses_arg_reviewer_uniq   RENAME TO app_peerreview_responses_arg_reviewer_uniq;
ALTER INDEX IF EXISTS app_review_responses_argument_uri_idx    RENAME TO app_peerreview_responses_argument_uri_idx;
ALTER INDEX IF EXISTS app_review_responses_reviewer_did_idx    RENAME TO app_peerreview_responses_reviewer_did_idx;

-- 3. Rename column on app_arguments
ALTER TABLE app_arguments
  RENAME COLUMN review_status TO peerreview_status;

-- 4. Rename the column index
ALTER INDEX IF EXISTS app_arguments_review_status_idx RENAME TO app_arguments_peerreview_status_idx;

-- 5. Re-grant indexer access (grants follow the table, but make explicit)
GRANT SELECT, INSERT, UPDATE ON app_peerreview_invitations TO indexer;
GRANT SELECT, INSERT, UPDATE ON app_peerreview_responses   TO indexer;
