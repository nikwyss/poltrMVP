-- Migration: Peer-review check-in & grace-period closure model
-- Run against an existing appview database.
-- Idempotent: safe to run multiple times.
--
-- Introduces:
--   * app_peerreviews          — per-argument lifecycle (open|provisional_closed|closed)
--   * checked_in_at, last_activity_at on app_peerreview_invitations
--
-- After this migration runs, the indexer must be updated to:
--   * insert an app_peerreviews row for every new user-submitted argument
--   * write provisional_closed on quorum (instead of approved/rejected directly)
-- and a new cron must run that promotes provisional_closed → closed once the
-- grace window expires. See doc/PEER_REVIEW.md.

-- =============================================================================
-- 1. Extend app_peerreview_invitations with check-in tracking
-- =============================================================================

ALTER TABLE app_peerreview_invitations
  ADD COLUMN IF NOT EXISTS checked_in_at    timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

CREATE INDEX IF NOT EXISTS app_peerreview_invitations_checked_in_idx
  ON app_peerreview_invitations (argument_uri, checked_in_at)
  WHERE checked_in_at IS NOT NULL;

-- =============================================================================
-- 2. Create app_peerreviews
-- =============================================================================

CREATE TABLE IF NOT EXISTS app_peerreviews (
  argument_uri          text PRIMARY KEY REFERENCES app_arguments(uri) ON DELETE CASCADE,
  state                 text NOT NULL DEFAULT 'open'
    CHECK (state IN ('open', 'provisional_closed', 'closed')),
  quorum                int  NOT NULL,
  opened_at             timestamptz NOT NULL DEFAULT now(),
  provisional_closed_at timestamptz,
  grace_until           timestamptz,
  closed_at             timestamptz,
  CONSTRAINT app_peerreviews_grace_when_provisional CHECK (
    (state = 'provisional_closed' AND grace_until IS NOT NULL AND provisional_closed_at IS NOT NULL)
    OR (state <> 'provisional_closed')
  ),
  CONSTRAINT app_peerreviews_closed_at_when_closed CHECK (
    (state = 'closed' AND closed_at IS NOT NULL) OR (state <> 'closed')
  )
);

CREATE INDEX IF NOT EXISTS app_peerreviews_state_idx
  ON app_peerreviews (state);
CREATE INDEX IF NOT EXISTS app_peerreviews_grace_until_idx
  ON app_peerreviews (grace_until)
  WHERE state = 'provisional_closed';

-- =============================================================================
-- 3. Backfill one row per existing user-submitted argument
-- =============================================================================
-- Already-decided arguments (approved/rejected) land directly in 'closed' so
-- they don't get re-evaluated; preliminary args become 'open'.

INSERT INTO app_peerreviews (argument_uri, state, quorum, opened_at, closed_at)
SELECT a.uri,
       CASE WHEN a.peerreview_status IN ('approved', 'rejected') THEN 'closed' ELSE 'open' END,
       10,
       a.created_at,
       CASE WHEN a.peerreview_status IN ('approved', 'rejected') THEN a.indexed_at ELSE NULL END
FROM app_arguments a
WHERE a.source_type = 'user' AND NOT a.deleted
ON CONFLICT (argument_uri) DO NOTHING;

-- =============================================================================
-- 4. Grants (indexer needs read/write)
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON app_peerreviews TO indexer;
