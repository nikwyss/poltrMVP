-- Add the return_url column to the pending-auth tables. The code (magic-link
-- and registration handlers) has long read/written return_url and db-setup.sql
-- defines it, but DBs created from the original 001/002 migrations never got it
-- → "column return_url does not exist". Same-origin relative path the user
-- wanted before being sent to auth, so we can redirect back afterwards.
ALTER TABLE auth_pending_logins
    ADD COLUMN IF NOT EXISTS return_url text;
ALTER TABLE auth_pending_registrations
    ADD COLUMN IF NOT EXISTS return_url text;
