-- Per-email send throttle for registration (anti email-bombing).
-- auth_pending_registrations is UNIQUE(email) with upsert, so a single row
-- cannot be counted to enforce a per-email window cap the way the (non-unique)
-- auth_pending_logins table can. Track the count + window start on the row.
-- See doc/SECURITY_AUTH.md #2.
ALTER TABLE auth_pending_registrations
    ADD COLUMN IF NOT EXISTS send_count integer NOT NULL DEFAULT 1;
ALTER TABLE auth_pending_registrations
    ADD COLUMN IF NOT EXISTS window_started_at timestamp NOT NULL DEFAULT now();
