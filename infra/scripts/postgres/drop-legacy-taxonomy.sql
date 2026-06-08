-- Migration: Legacy bottom-up Taxonomie + Open Coding entfernen.
-- Gegen die **appview**-Datenbank ausführen. Idempotent.
--
--   psql "$APPVIEW_POSTGRES_URL" -f infra/scripts/postgres/drop-legacy-taxonomy.sql
--
-- Hintergrund: Der produktive Pfad ist die top-down Themen-Hierarchie
-- (app_topic_node / app_topic_membership). Die alte, emergente Achsen-Welt
-- (Open Coding → versionierte app_taxonomy_*-Läufe + app_arguments_axis) wird
-- nicht mehr gebraucht — Calculator-Module, Worker, Endpoints und Frontend-/
-- AppView-Reads dazu sind entfernt.
--
-- ACHTUNG: DESTRUKTIV. Löscht die Tabellen samt Inhalt unwiderruflich. Die
-- top-down-Tabellen (app_topic_*) bleiben unangetastet.

BEGIN;

-- Reihenfolge unkritisch dank CASCADE, aber explizit von „Blatt" zu „Wurzel":
DROP TABLE IF EXISTS app_arguments_axis        CASCADE;
DROP TABLE IF EXISTS app_taxonomy_membership   CASCADE;
DROP TABLE IF EXISTS app_taxonomy_bundle       CASCADE;
DROP TABLE IF EXISTS app_taxonomy_axis         CASCADE;
DROP TABLE IF EXISTS app_taxonomy_run          CASCADE;
DROP TABLE IF EXISTS app_argument_open_codes   CASCADE;

COMMIT;
