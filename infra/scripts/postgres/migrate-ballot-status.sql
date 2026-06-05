-- Migration: Ballot-Status 'archived' + Lesezugriff für den Calculator.
-- WICHTIG: gegen die **cms**-Datenbank ausführen (Payload), NICHT appview!
-- Idempotent.
--
--   psql "$CMS_DATABASE_URL" -f infra/scripts/postgres/migrate-ballot-status.sql
--
-- Hintergrund: Der Open-Coding-Worker (Calculator) codiert nur Argumente von
-- Ballots mit Status in (published, draft). 'archived' nimmt einen Ballot aus
-- der Codierung (Daten bleiben). Siehe services/calculator + Ballots.ts.

-- 1) Neuen Enum-Wert ergänzen (Payload-Select 'status' = enum_ballots_status).
ALTER TYPE enum_ballots_status ADD VALUE IF NOT EXISTS 'archived';

-- 2) Read-only-Zugriff für die (cluster-globale) Rolle calculator auf die
--    CMS-Ballots, damit der Worker den Status lesen kann.
GRANT CONNECT ON DATABASE cms TO calculator;
GRANT USAGE ON SCHEMA public TO calculator;
GRANT SELECT ON ballots TO calculator;
