-- Migration: Index der veröffentlichten Taxonomie-Snapshots.
--
-- Beim „Persistieren" der Top-down-Taxonomie schreibt das CMS einen unveränderlichen
-- app.ch.poltr.taxonomy.snapshot-Record auf das Governance-Konto des Ballots (append-only,
-- ein Record je Änderung). Diese Tabelle protokolliert die publizierten Snapshots, damit
-- die Versionshistorie im CMS ohne PDS-Abfrage angezeigt werden kann.
--
-- Quelle der Wahrheit für den AKTUELLEN Baum bleibt app_taxonomy_node/app_taxonomy_membership.
--
-- Idempotent: kann mehrfach ausgeführt werden.

CREATE TABLE IF NOT EXISTS app_taxonomy_snapshot (
  ballot_rkey  text NOT NULL,
  version      integer NOT NULL,
  at_uri       text NOT NULL,
  cid          text NOT NULL,
  content_hash text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ballot_rkey, version)
);

CREATE INDEX IF NOT EXISTS app_taxonomy_snapshot_ballot_idx ON app_taxonomy_snapshot (ballot_rkey);
