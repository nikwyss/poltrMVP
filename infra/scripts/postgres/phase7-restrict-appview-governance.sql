-- =============================================================================
-- phase7-restrict-appview-governance.sql
--
-- Phase 7 der ATProto-native-Umstellung: die appview-API schreibt KEINE
-- Governance-Records mehr (kein create_/put_governance_record, kein Gov-Cred-
-- Decrypt). Aus auth.governance_accounts liest sie nur noch did/ballot_rkey
-- (Ballot-Enrichment in ballots.py + get_did_for_ballot in arguments.py).
-- → Schreib- und pw-Zugriff entziehen, nur spaltenweises SELECT lassen
--   (analog zur indexer-Rolle: kein pw_ciphertext/pw_nonce).
--
-- VORAUSSETZUNG:
--   1) das neue appview-Image (ohne Gov-Write-Pfad) ist deployt, UND
--   2) appview läuft als DB-Rolle 'appview' (nicht mehr 'allforone').
--   Solange appview noch als allforone (Superuser) läuft, greift dieser
--   Entzug NICHT (Superuser umgeht Grants). Erst nach dem appview@-Switch.
--
-- Als SUPERUSER gegen die appview-DB:
--   psql "postgresql://allforone:<pw>@<host>:5432/appview" \
--     -f phase7-restrict-appview-governance.sql
-- =============================================================================

-- Den tabellenweiten auth-Grant (aus add-pod-roles.sql) für governance_accounts
-- zurücknehmen und durch spaltenweises SELECT ersetzen. pw_ciphertext/pw_nonce
-- bleiben damit unzugänglich; INSERT/UPDATE/DELETE entfallen.
REVOKE ALL ON auth.governance_accounts FROM appview;
GRANT SELECT (did, handle, ballot_rkey, ballot_uri)
  ON auth.governance_accounts TO appview;

-- Verifikation (als Rolle 'appview'):
--   SELECT did, ballot_rkey FROM auth.governance_accounts;   -- ok
--   SELECT pw_ciphertext   FROM auth.governance_accounts;    -- permission denied
--   INSERT INTO auth.governance_accounts ...;                -- permission denied
