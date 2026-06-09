-- Outbound auth-email ledger for the global hourly circuit breaker.
-- One row per auth email actually sent (login magic link / registration
-- confirmation). The breaker counts rows in the last hour to enforce a
-- platform-wide alert threshold + hard cap, independent of per-IP / per-email
-- limits. DB-backed (not in-memory) so it is correct across replicas and
-- survives restarts. Rows are pruned (older than 2h) on each insert, so the
-- table stays tiny. See doc/SECURITY_AUTH.md #4.
CREATE TABLE IF NOT EXISTS auth_email_sends (
    id         serial PRIMARY KEY,
    purpose    varchar(20) NOT NULL,
    created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_email_sends_created_at ON auth_email_sends (created_at);
