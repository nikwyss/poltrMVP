-- Per-email send throttle for LOGIN (anti email-bombing).
--
-- Background: the per-email cap on login was originally enforced by COUNTing
-- auth_pending_logins rows in the window (see migration 001 / #2). That broke
-- once ch.poltr.auth.start started collapsing to ONE live code per email
-- (DELETE-then-INSERT): with at most one row, the count is pinned at <=1 and the
-- cap (10) is never reached, so the per-email login throttle was a no-op.
--
-- Fix: align login with the registration pattern — track the count + window
-- start ON THE ROW and make the table UNIQUE(email_hmac) so start_handler can
-- upsert atomically (no DELETE+INSERT race). See doc/SECURITY_AUTH.md #2.

-- Collapse any pre-existing duplicates (legacy rows, or the now-removed
-- sendMagicLink path) before the UNIQUE constraint can be added: keep the
-- newest row per email.
DELETE FROM auth.auth_pending_logins a
USING auth.auth_pending_logins b
WHERE a.email_hmac = b.email_hmac
  AND a.id < b.id;

ALTER TABLE auth.auth_pending_logins
    ADD COLUMN IF NOT EXISTS send_count integer NOT NULL DEFAULT 1;
ALTER TABLE auth.auth_pending_logins
    ADD COLUMN IF NOT EXISTS window_started_at timestamp NOT NULL DEFAULT now();

ALTER TABLE auth.auth_pending_logins
    ADD CONSTRAINT auth_pending_logins_email_hmac_key UNIQUE (email_hmac);

-- The unique constraint creates its own index; the old non-unique one is now
-- redundant.
DROP INDEX IF EXISTS auth.idx_auth_pending_logins_email_hmac;
