-- =============================================================================
-- harden-service-roles.sql
--
-- Live-Migration für einen LAUFENDEN Cluster: löst ozone und cms aus der
-- geteilten Superuser-Rolle 'allforone' heraus und gibt ihnen eigene, eng
-- gescopte Login-Rollen. Ziel: ein kompromittierter Ozone-/CMS-Pod kann das
-- auth-Schema der appview-DB nicht mehr erreichen.
--
-- Idempotent gehalten (mehrfach ausführbar). Als SUPERUSER (allforone) ausführen.
--
--   psql "postgresql://allforone:<pw>@<host>:5432/postgres" -f harden-service-roles.sql
--
-- WICHTIG vor dem Lauf:
--   * Passwörter unten ('CHANGE_ME') auf die echten Werte aus secrets.yaml setzen
--     (oder die Rollen vorab via db-setup.sql anlegen und hier nur die ALTER ROLE
--     ... PASSWORD-Zeilen nutzen).
--   * pg_dump der ozone- und cms-DB ziehen (Block B/C ändern Ownership live).
--   * Reihenfolge: erst ozone testen (unkritischer), dann cms.
--   * Danach secrets.yaml auf die neuen User umstellen, K8s-Secrets neu anwenden
--     und die cms-/ozone-Deployments neu ausrollen.
--
-- Hinweis Footgun: Wir nutzen BEWUSST KEIN "REASSIGN OWNED BY allforone TO ...",
-- weil REASSIGN OWNED auch SHARED OBJECTS (alle Datenbanken!) umhängt und damit
-- die Ownership sämtlicher DBs auf eine Service-Rolle ziehen würde. Stattdessen
-- ein expliziter, auf die aktuelle DB beschränkter ALTER ... OWNER-Loop.
-- =============================================================================


-- =============================================================================
-- BLOCK A — appview-DB: Rollen anlegen, CONNECT härten, Grants setzen
-- =============================================================================
\connect appview


-- CONNECT-Härtung: PUBLIC darf sich nicht mehr mit appview verbinden; nur die
-- berechtigten Service-Rollen. (allforone = Superuser, umgeht den Check.)
REVOKE CONNECT ON DATABASE appview FROM PUBLIC;
GRANT  CONNECT ON DATABASE appview TO indexer;     -- bereits vorhanden, idempotent
GRANT  CONNECT ON DATABASE appview TO calculator;  -- bereits vorhanden, idempotent
GRANT  CONNECT ON DATABASE appview TO cms;

-- cms: nur Governance-Creds + Snapshot-Dedup-Ledger.
GRANT USAGE ON SCHEMA auth   TO cms;
GRANT SELECT, INSERT ON auth.governance_accounts TO cms;
GRANT USAGE ON SCHEMA public TO cms;
GRANT SELECT, INSERT ON app_taxonomy_snapshot TO cms;

-- ozone: KEIN appview-Zugriff. (Kein GRANT CONNECT; PUBLIC ist oben revoked.)

-- calculator-Cleanup: die /induce|/classify|/grow-Endpoints schreiben nichts in
-- die DB (Persistenz läuft über den CMS-Snapshot → Indexer). Ungenutzte
-- Schreibrechte entziehen, SELECT bleibt.
REVOKE INSERT, UPDATE, DELETE ON app_taxonomy_node, app_taxonomy_membership FROM calculator;


-- =============================================================================
-- BLOCK B — ozone-DB: Ownership von allforone auf die ozone-Rolle übertragen,
-- damit der Bluesky-Ozone-Container seine Migrationen weiter ausführen kann.
-- =============================================================================
\connect ozone

ALTER DATABASE ozone OWNER TO ozone;
ALTER SCHEMA public OWNER TO ozone;

-- Alle Tabellen/Sequenzen/Views/Typen im public-Schema, die allforone gehören,
-- auf ozone umhängen. Nur die AKTUELLE DB betroffen (kein REASSIGN OWNED).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relkind, n.nspname, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_roles o     ON o.oid = c.relowner
    WHERE n.nspname = 'public'
      AND o.rolname = 'allforone'
      AND c.relkind IN ('r','p','S','v','m')  -- table, partitioned, sequence, view, matview
      -- owned (SERIAL/identity) Sequenzen NICHT einzeln umhängen — ihr Owner folgt
      -- automatisch der Tabelle (sonst: "cannot change owner of sequence").
      AND NOT (c.relkind = 'S' AND EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid
          AND d.refclassid = 'pg_class'::regclass AND d.deptype = 'a'))
  LOOP
    IF r.relkind = 'S' THEN
      EXECUTE format('ALTER SEQUENCE %I.%I OWNER TO ozone', r.nspname, r.relname);
    ELSIF r.relkind IN ('v','m') THEN
      EXECUTE format('ALTER %s %I.%I OWNER TO ozone',
                     CASE r.relkind WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'VIEW' END,
                     r.nspname, r.relname);
    ELSE
      EXECUTE format('ALTER TABLE %I.%I OWNER TO ozone', r.nspname, r.relname);
    END IF;
  END LOOP;
END
$$;

GRANT ALL ON SCHEMA public TO ozone;


-- =============================================================================
-- BLOCK C — cms-DB: Ownership von allforone auf die cms-Rolle übertragen,
-- damit Payload weiter DDL (CREATE/ALTER/DROP TABLE) ausführen kann.
-- =============================================================================
\connect cms

ALTER DATABASE cms OWNER TO cms;
ALTER SCHEMA public OWNER TO cms;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relkind, n.nspname, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_roles o     ON o.oid = c.relowner
    WHERE n.nspname = 'public'
      AND o.rolname = 'allforone'
      AND c.relkind IN ('r','p','S','v','m')
      -- owned (SERIAL/identity) Sequenzen NICHT einzeln umhängen — ihr Owner folgt
      -- automatisch der Tabelle (sonst: "cannot change owner of sequence").
      AND NOT (c.relkind = 'S' AND EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid
          AND d.refclassid = 'pg_class'::regclass AND d.deptype = 'a'))
  LOOP
    IF r.relkind = 'S' THEN
      EXECUTE format('ALTER SEQUENCE %I.%I OWNER TO cms', r.nspname, r.relname);
    ELSIF r.relkind IN ('v','m') THEN
      EXECUTE format('ALTER %s %I.%I OWNER TO cms',
                     CASE r.relkind WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'VIEW' END,
                     r.nspname, r.relname);
    ELSE
      EXECUTE format('ALTER TABLE %I.%I OWNER TO cms', r.nspname, r.relname);
    END IF;
  END LOOP;
END
$$;

-- Auch die ENUM-/Composite-Typen umhängen (Payload erzeugt z.B. enum_*_locales).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT t.typname
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_roles o     ON o.oid = t.typowner
    WHERE n.nspname = 'public'
      AND o.rolname = 'allforone'
      AND t.typtype IN ('e','c')               -- enum, composite
      AND NOT EXISTS (                          -- keine impliziten Tabellen-Rowtypes
        SELECT 1 FROM pg_class c WHERE c.reltype = t.oid)
  LOOP
    EXECUTE format('ALTER TYPE public.%I OWNER TO cms', r.typname);
  END LOOP;
END
$$;

GRANT ALL ON SCHEMA public TO cms;

-- calculator liest die cms-DB (CALCULATOR_CMS_POSTGRES_URL) für Ballot-Inhalte.
-- Bestehende GRANTs bleiben durch den Ownership-Wechsel erhalten; für KÜNFTIG von
-- cms erzeugte Tabellen den Lesezugriff per Default-Privileges absichern.
ALTER DEFAULT PRIVILEGES FOR ROLE cms IN SCHEMA public GRANT SELECT ON TABLES TO calculator;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO calculator;

-- =============================================================================
-- Fertig. Verifikation siehe Plan / README:
--   * psql als 'ozone' gegen appview  -> permission denied for database appview
--   * psql als 'cms'   -> SELECT auth.governance_accounts ok, auth.auth_creds denied
--   * psql als 'calculator' -> INSERT app_taxonomy_node denied, SELECT ok
-- =============================================================================
