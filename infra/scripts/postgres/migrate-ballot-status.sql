-- Migration: Ballot-Status 'archived' + Lesezugriff für den Calculator.
-- WICHTIG: gegen die **cms**-Datenbank ausführen (Payload), NICHT appview!
-- Idempotent.
--
--   psql "$CMS_DATABASE_URL" -f infra/scripts/postgres/migrate-ballot-status.sql
--
-- Hintergrund: 'archived' ist ein Ballot-Lifecycle-Status (Daten bleiben);
-- siehe Ballots.ts. Der Calculator liest die CMS-Ballots read-only (amtliche
-- Vorlagen-Beschreibung als Themen-Kontext) → braucht den Grant unten.

-- 1) Neuen Enum-Wert ergänzen (Payload-Select 'status' = enum_ballots_status).
ALTER TYPE enum_ballots_status ADD VALUE IF NOT EXISTS 'archived';

-- 2) Read-only-Zugriff für die (cluster-globale) Rolle calculator auf die
--    CMS-Ballots (amtliche Vorlagen-Beschreibung als Themen-Kontext).
GRANT CONNECT ON DATABASE cms TO calculator;
GRANT USAGE ON SCHEMA public TO calculator;
GRANT SELECT ON ballots TO calculator;
