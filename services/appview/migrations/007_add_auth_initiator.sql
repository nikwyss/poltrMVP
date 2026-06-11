-- Initiator-Cookie support for the unified magic-link flow.
--
-- When a user enters their email (ch.poltr.auth.start), the server hands back an
-- `initiatorSecret`; the frontend stores its SHA-256 in a httpOnly cookie. When
-- the magic link is later opened, the verify preflight (ch.poltr.auth.checkLink)
-- compares the cookie's hash against this column to decide "same browser"
-- (instant confirm) vs "different browser" (reveal the 6-char code for the other
-- device). Nullable: links created before this migration, or opened without the
-- cookie, simply fall through to the different-browser path. See doc/SECURITY_AUTH.md.
ALTER TABLE auth_pending_logins
    ADD COLUMN IF NOT EXISTS initiator_id varchar(64);
ALTER TABLE auth_pending_registrations
    ADD COLUMN IF NOT EXISTS initiator_id varchar(64);
