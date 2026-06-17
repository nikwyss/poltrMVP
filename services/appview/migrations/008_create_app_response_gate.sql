-- Peer-review submission gate — single source of truth for the DB-state
-- authorization of a review response. Called by BOTH the appview (submit_review)
-- and the community-writer (acceptance._accept_response) so the two cannot drift.
-- Returns NULL when allowed, else a reason in fixed priority (matches the
-- appview's historical order). Vote-payload validity stays in code (not DB state).
-- SECURITY INVOKER (default): both caller roles already hold SELECT on these tables.
-- Idempotent via CREATE OR REPLACE. End state lives in infra/scripts/postgres/db-setup.sql.
CREATE OR REPLACE FUNCTION app_response_gate(p_argument_uri text, p_reviewer_did text)
RETURNS text AS $$
DECLARE
  v_state text;
  v_checked_in timestamptz;
BEGIN
  SELECT pr.state INTO v_state
  FROM app_peerreviews pr
  WHERE pr.argument_uri = p_argument_uri
    AND EXISTS (SELECT 1 FROM app_arguments a
                WHERE a.uri = p_argument_uri AND NOT a.deleted);
  IF NOT FOUND THEN
    RETURN 'no_peerreview';
  END IF;

  -- checked_in_at may legitimately be NULL on an existing row, so use FOUND (not
  -- the value) to distinguish "no invitation" from "invited, not yet checked in".
  SELECT ri.checked_in_at INTO v_checked_in
  FROM app_peerreview_invitations ri
  WHERE ri.argument_uri = p_argument_uri
    AND ri.invitee_did = p_reviewer_did
    AND ri.invited = true;
  IF NOT FOUND THEN
    RETURN 'not_invited';
  END IF;

  IF v_state = 'closed' THEN
    RETURN 'review_closed';
  END IF;
  IF v_checked_in IS NULL THEN
    RETURN 'not_checked_in';
  END IF;

  RETURN NULL;  -- allowed
END;
$$ LANGUAGE plpgsql STABLE;
