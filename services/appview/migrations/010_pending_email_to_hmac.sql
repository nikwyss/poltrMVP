-- 010: auth_pending_logins/registrations.email (plaintext) -> email_hmac.
--
-- The pending tables only ever hold transient rows (<=10 min TTL, one per
-- in-flight magic-link flow). So unlike auth_creds (migration 009) there is
-- nothing worth converting — we TRUNCATE to purge any leftover plaintext, then
-- rename the column/index/constraint. Any flow in flight at migration time just
-- needs the user to request a fresh link.
--
-- App code (start_handler / verify_* / check_link) now writes & queries the
-- peppered HMAC (email_digest()); the plaintext address is used only to send the
-- mail, straight from the request body, never persisted.

TRUNCATE auth.auth_pending_logins;
TRUNCATE auth.auth_pending_registrations;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'auth_pending_logins'
      AND column_name = 'email'
  ) THEN
    ALTER TABLE auth.auth_pending_logins RENAME COLUMN email TO email_hmac;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'auth_pending_registrations'
      AND column_name = 'email'
  ) THEN
    ALTER TABLE auth.auth_pending_registrations RENAME COLUMN email TO email_hmac;
  END IF;
END $$;

ALTER INDEX IF EXISTS auth.idx_auth_pending_logins_email
  RENAME TO idx_auth_pending_logins_email_hmac;
ALTER INDEX IF EXISTS auth.idx_auth_pending_registrations_email
  RENAME TO idx_auth_pending_registrations_email_hmac;
-- UNIQUE(email) on registrations: rename the auto-named constraint index too.
ALTER INDEX IF EXISTS auth.auth_pending_registrations_email_key
  RENAME TO auth_pending_registrations_email_hmac_key;
