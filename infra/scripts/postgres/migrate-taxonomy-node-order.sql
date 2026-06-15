-- Migration: explizite Geschwister-Reihenfolge für Taxonomie-Knoten.
--
-- Hintergrund: Die Taxonomie wird künftig aus dem PDS-Snapshot in die DB projiziert
-- (Indexer). Dabei werden Knoten per stabilem `key` ge-UPSERT-et — die DB-`id`-
-- Reihenfolge spiegelt also nicht mehr die (vom Admin editierbare) Geschwister-
-- Reihenfolge. Die Reihenfolge kommt jetzt explizit aus dem Snapshot (Array-Order)
-- und wird in `node_order` projiziert; das Serving sortiert danach.
--
-- Idempotent.

ALTER TABLE app_taxonomy_node ADD COLUMN IF NOT EXISTS node_order integer NOT NULL DEFAULT 0;

-- Der Indexer projiziert den Snapshot künftig in den Baum (Waisen löschen, Memberships
-- ersetzen) und braucht dafür DELETE auf beiden Tabellen (bislang nur SELECT/INSERT/UPDATE).
GRANT DELETE ON app_taxonomy_node, app_taxonomy_membership TO indexer;
