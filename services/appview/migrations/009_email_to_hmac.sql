-- 009: auth_creds.email (plaintext) -> auth_creds.email_hmac (peppered HMAC).
--
-- This migration ONLY renames the column/index/constraint. It does NOT convert
-- the existing values — the plaintext rows still sit in email_hmac after this
-- runs. Converting them requires the pepper (APPVIEW_EMAIL_HMAC_PEPPER_B64),
-- which we deliberately keep OUT of committed SQL, so the conversion is a
-- separate step:
--
--     infra/scripts/backfill_email_hmac.py   (idempotent; converts rows that
--                                              still contain '@')
--
-- DEPLOY ORDER (short maintenance window — auth is briefly affected):
--   1. Add APPVIEW_EMAIL_HMAC_PEPPER_B64 to appview-secrets and apply it.
--   2. Apply THIS migration  +  roll out the appview image that reads/writes
--      email_hmac (do these together: the rename breaks the old image, which
--      still references `email`).
--   3. Run backfill_email_hmac.py. Until it completes, EXISTING accounts cannot
--      log in (their digest lookup misses the still-plaintext rows); new
--      registrations already work. No data is lost.
--
-- Idempotency: guarded so a re-run after a partial apply is a no-op.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'auth_creds'
      AND column_name = 'email'
  ) THEN
    ALTER TABLE auth.auth_creds RENAME COLUMN email TO email_hmac;
  END IF;
END $$;

ALTER INDEX IF EXISTS auth.idx_auth_creds_email       RENAME TO idx_auth_creds_email_hmac;
ALTER INDEX IF EXISTS auth.auth_creds_email_key        RENAME TO auth_creds_email_hmac_key;
