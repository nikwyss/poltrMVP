-- Full database setup for fresh 'appview' installs.
-- Run as superuser or the allforone role.

-- =============================================================================
-- Schemas
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS auth;

-- =============================================================================
-- public schema: app tables (indexer r/w, appview read)
-- =============================================================================

CREATE TABLE app_ballots (
  uri         text PRIMARY KEY,   -- at://did/.../app.ch.poltr.vote.proposal/...
  cid         text NOT NULL,
  did         text NOT NULL,      -- repo DID (actor)
  rkey        text NOT NULL,      -- record key
  title       text,
  description text,
  vote_date   timestamptz,
  like_count      integer NOT NULL DEFAULT 0,
  argument_count  integer NOT NULL DEFAULT 0,
  comment_count   integer NOT NULL DEFAULT 0,
  bsky_post_uri text,               -- URI of the cross-posted app.bsky.feed.post
  bsky_post_cid text,               -- CID of the cross-posted app.bsky.feed.post
  active      integer NOT NULL DEFAULT 0,  -- 0=disabled, 1=active (enables REVERSE mirroring from Bluesky)
  bsky_like_count   integer NOT NULL DEFAULT 0,
  bsky_repost_count integer NOT NULL DEFAULT 0,
  bsky_reply_count  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL,
  indexed_at  timestamptz NOT NULL DEFAULT now(),
  deleted     boolean NOT NULL DEFAULT false
);

CREATE INDEX app_ballots_vote_date_idx
  ON app_ballots (vote_date);

CREATE INDEX app_ballots_did_idx
  ON app_ballots (did);

CREATE TABLE app_likes (
  uri         text PRIMARY KEY,
  cid         text NOT NULL,
  did         text NOT NULL,
  rkey        text NOT NULL,
  subject_uri text NOT NULL,
  subject_cid text,
  bsky_like_uri text,               -- URI of the cross-like app.bsky.feed.like (set by AppView)
  preference  integer,              -- 0-100 preference scale from app.ch.poltr.content.rating
  created_at  timestamptz NOT NULL,
  indexed_at  timestamptz NOT NULL DEFAULT now(),
  deleted     boolean NOT NULL DEFAULT false
);

CREATE INDEX app_likes_subject_uri_idx ON app_likes (subject_uri);
CREATE INDEX app_likes_did_idx ON app_likes (did);

CREATE TABLE app_arguments (
  uri           text PRIMARY KEY,       -- at://did/.../app.ch.poltr.ballot.argument/...
  cid           text NOT NULL,
  did           text NOT NULL,          -- repo DID (community account)
  rkey          text NOT NULL,          -- record key
  author_did    text,                   -- DID of the user who authored this argument (required for source_type='user')
  title         text NOT NULL,
  body          text NOT NULL,
  type          text NOT NULL,          -- 'PRO' or 'CONTRA'
  ballot_uri    text NOT NULL,          -- AT URI of the ballot entry
  ballot_rkey   text NOT NULL,          -- rkey of the ballot (for fast lookups)
  bsky_post_uri text,                -- URI of the cross-posted app.bsky.feed.post
  bsky_post_cid text,                -- CID of the cross-posted app.bsky.feed.post
  like_count       integer NOT NULL DEFAULT 0,
  comment_count    integer NOT NULL DEFAULT 0,
  bsky_reply_count integer NOT NULL DEFAULT 0,
  peerreview_status text NOT NULL DEFAULT 'preliminary' CHECK (peerreview_status IN ('preliminary', 'approved', 'rejected')),
  -- Source discriminator: 'user' = user-submitted, 'official' = Bundeskanzlei leaflet,
  -- 'organization' = party/association/NGO (schema reserved, not yet wired up).
  source_type        text NOT NULL DEFAULT 'user'
    CHECK (source_type IN ('user', 'official', 'organization')),
  source_org_key     text,              -- CMS slug, set for source_type='organization'
  source_doc_ref     text,              -- URL to leaflet / org publication
  source_section     text,              -- Page/section within the source document
  source_verified_did text,             -- Optional DID that vouches for the record
  -- Herkunft (#sourceUser, ATProto-native Pfad): Referenz auf den user-signierten
  -- Original-Record im User-Repo, aus dem die interne Schreib-Seite diesen
  -- Community-Record kopiert hat. NULL für official/org (community-authored).
  origin_uri         text,
  origin_cid         text,
  -- Multilingual content: original languages (BCP-47, Bluesky-compatible `langs` array)
  -- plus inline translations. translation_status drives the background worker queue.
  langs              text[] NOT NULL DEFAULT ARRAY['de-CH'],
  translations       jsonb  NOT NULL DEFAULT '[]'::jsonb,
  translation_status text   NOT NULL DEFAULT 'pending'
    CHECK (translation_status IN ('pending', 'partial', 'complete', 'manual_only')),
  created_at    timestamptz NOT NULL,
  indexed_at    timestamptz NOT NULL DEFAULT now(),
  deleted       boolean NOT NULL DEFAULT false,
  CONSTRAINT app_arguments_source_consistency CHECK (
    (source_type = 'user'         AND author_did IS NOT NULL) OR
    (source_type = 'official'     AND source_org_key IS NULL) OR
    (source_type = 'organization' AND source_org_key IS NOT NULL)
  )
);

-- Akzeptanz-Queue (ATProto-native Pfad): Handoff Projektor → Writer UND
-- Reconcile-Log in einem. Der Projektor stellt user-authored Original-Records
-- (aus User-Repos) hier ein; der Writer pollt (LISTEN/NOTIFY + FOR UPDATE SKIP
-- LOCKED), gated sie und schreibt den kanonischen Community-Record ins
-- Community-Repo. `kind` unterscheidet alle drei Pfade (argument/response/request).
-- UNIQUE(user_uri) = Idempotenz (ein Original → eine Zeile). `record` cached den
-- gesehenen Record (CID-gepinnt) → spart dem Writer ein getRecord.
CREATE TABLE app_acceptance_queue (
  id          bigserial PRIMARY KEY,
  user_uri    text NOT NULL UNIQUE,
  user_cid    text NOT NULL,
  did         text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('argument', 'response', 'request')),
  ballot      text,
  status      text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'done', 'rejected')),
  reason      text,
  record      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX app_acceptance_queue_pending_idx
  ON app_acceptance_queue (created_at) WHERE status = 'pending';

CREATE INDEX app_arguments_ballot_uri_idx    ON app_arguments (ballot_uri);
CREATE INDEX app_arguments_ballot_rkey_idx   ON app_arguments (ballot_rkey);
CREATE INDEX app_arguments_did_idx           ON app_arguments (did);
CREATE INDEX app_arguments_author_did_idx    ON app_arguments (author_did);
CREATE INDEX app_arguments_type_idx          ON app_arguments (type);
CREATE INDEX app_arguments_peerreview_status_idx ON app_arguments (peerreview_status);
CREATE INDEX app_arguments_source_type_idx   ON app_arguments (source_type);
CREATE INDEX app_arguments_source_org_key_idx ON app_arguments (source_org_key)
  WHERE source_org_key IS NOT NULL;
-- Translation worker queue: partial index on the subset the worker needs to process.
CREATE INDEX app_arguments_translation_status_idx
  ON app_arguments (translation_status)
  WHERE NOT deleted AND translation_status IN ('pending', 'partial');
-- GIN index for filtering by language (e.g. WHERE 'fr' = ANY(langs)).
CREATE INDEX app_arguments_langs_idx ON app_arguments USING GIN (langs);

-- Top-down Themen-Hierarchie (Arbeitsbaum, EIN stabiler Baum pro Ballot, inkrementell).
CREATE TABLE app_taxonomy_node (              -- Adjazenzliste: parent_id → Elternknoten (NULL = Wurzel)
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ballot_rkey  text NOT NULL,
  parent_id    bigint REFERENCES app_taxonomy_node(id) ON DELETE CASCADE,
  key          text,                  -- langlebiger Slug (mit '-'); set-once, für Permalinks
  name         text NOT NULL,
  description  text,                  -- 1 Satz, was darunterfällt — Kontext für den LLM-Klassifikator
  introduction text,                  -- voter-facing: warum das Thema zählt & für wen (Stimmbürgerschaft) — im Frontend gezeigt
  depth        integer NOT NULL DEFAULT 0,
  node_order   integer NOT NULL DEFAULT 0,  -- Geschwister-Reihenfolge (vom Snapshot, da DB-id-Order nach Rebuild nicht stabil)
  importance   smallint CHECK (importance IS NULL OR importance BETWEEN 1 AND 5),  -- LLM-Prior 1–5 (nur CMS)
  -- Übersetzung der voter-facing Felder name + introduction (description bleibt
  -- intern/deutsch). Vom appview-Translation-Worker direkt hier befüllt (kein
  -- PDS/Firehose — Taxonomie lebt nur in der DB). translations:
  --   [{lang, name, introduction, source:'ai'|'manual', model, translatedAt}]
  langs              text[] NOT NULL DEFAULT ARRAY['de-CH'],
  translations       jsonb  NOT NULL DEFAULT '[]'::jsonb,
  translation_status text   NOT NULL DEFAULT 'pending'
    CHECK (translation_status IN ('pending', 'partial', 'complete', 'manual_only')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX app_taxonomy_node_ballot_idx ON app_taxonomy_node (ballot_rkey);
CREATE INDEX app_taxonomy_node_parent_idx ON app_taxonomy_node (parent_id);
CREATE UNIQUE INDEX app_taxonomy_node_key_uidx ON app_taxonomy_node (ballot_rkey, key) WHERE key IS NOT NULL;
-- Worker-Queue: nur unübersetzte Knoten.
CREATE INDEX app_taxonomy_node_tx_status_idx ON app_taxonomy_node (translation_status)
  WHERE translation_status IN ('pending', 'partial');

-- Quelltext geändert (Rebuild/CMS-Edit) → Übersetzungen verwerfen, Status zurück
-- auf 'pending', damit der Worker neu übersetzt.
CREATE OR REPLACE FUNCTION app_taxonomy_node_reset_translations() RETURNS trigger AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name
     OR NEW.introduction IS DISTINCT FROM OLD.introduction THEN
    NEW.translations := '[]'::jsonb;
    NEW.translation_status := 'pending';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_taxonomy_node_reset_translations_trg ON app_taxonomy_node;
CREATE TRIGGER app_taxonomy_node_reset_translations_trg
  BEFORE UPDATE ON app_taxonomy_node
  FOR EACH ROW EXECUTE FUNCTION app_taxonomy_node_reset_translations();

CREATE TABLE app_taxonomy_membership (       -- Argument → Knoten (Einheit = Argument; genau EIN Knoten pro Argument)
  ballot_rkey  text NOT NULL,
  node_id      bigint NOT NULL REFERENCES app_taxonomy_node(id) ON DELETE CASCADE,
  argument_uri text NOT NULL,
  confidence   smallint CHECK (confidence IS NULL OR confidence BETWEEN 1 AND 5),  -- Klassifikator-Sicherheit 1–5
  stance       text CHECK (stance IN ('pro','contra')),  -- = app_arguments.type (PRO/CONTRA), keine Analyse
  code         text,                            -- optionale, vestigiale Provenienz-Spalte (heute ungenutzt)
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ballot_rkey, argument_uri, node_id)
);
CREATE INDEX app_taxonomy_membership_node_idx ON app_taxonomy_membership (node_id);
CREATE UNIQUE INDEX app_taxonomy_membership_arg_uidx          -- genau EIN Knoten pro Argument
  ON app_taxonomy_membership (ballot_rkey, argument_uri);

-- Index der veröffentlichten Taxonomie-Snapshots. Beim „Persistieren" schreibt das
-- CMS einen unveränderlichen app.ch.poltr.taxonomy.snapshot-Record auf das Community-
-- Konto des Ballots (append-only) und protokolliert ihn hier — damit die Versions-
-- historie im CMS ohne PDS-Abfrage angezeigt werden kann. Quelle der Wahrheit für
-- den AKTUELLEN Baum bleibt app_taxonomy_node/app_taxonomy_membership; diese Tabelle ist
-- nur der Verlauf der publizierten Schnappschüsse.
CREATE TABLE app_taxonomy_snapshot (
  ballot_rkey  text NOT NULL,
  version      integer NOT NULL,             -- fortlaufend je Ballot (1 = erster Snapshot)
  at_uri       text NOT NULL,                -- AT-URI des Snapshot-Records
  cid          text NOT NULL,
  content_hash text NOT NULL,                -- sha256 über die kanonische Knoten-Serialisierung (Dedup)
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ballot_rkey, version)
);
CREATE INDEX app_taxonomy_snapshot_ballot_idx ON app_taxonomy_snapshot (ballot_rkey);

CREATE TABLE app_peerreview_invitations (
  uri              text PRIMARY KEY,
  cid              text NOT NULL,
  argument_uri     text NOT NULL,
  invitee_did      text NOT NULL,
  invited          boolean NOT NULL,            -- true = invited, false = not selected (immutable)
  -- Check-in protects in-flight reviewers from losing work when quorum closes
  -- the review mid-typing. checked_in_at is set when the user opens the review
  -- form (POST .review.checkIn); last_activity_at slides forward on each real
  -- input event (POST .review.activity) and drives the grace-window extension
  -- on app_peerreviews.grace_until. Both NULL until first check-in.
  checked_in_at    timestamptz,
  last_activity_at timestamptz,
  created_at       timestamptz NOT NULL,
  indexed_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX app_peerreview_invitations_arg_invitee_uniq
  ON app_peerreview_invitations (argument_uri, invitee_did);
CREATE INDEX app_peerreview_invitations_argument_uri_idx ON app_peerreview_invitations (argument_uri);
CREATE INDEX app_peerreview_invitations_invitee_did_idx  ON app_peerreview_invitations (invitee_did);
CREATE INDEX app_peerreview_invitations_checked_in_idx
  ON app_peerreview_invitations (argument_uri, checked_in_at)
  WHERE checked_in_at IS NOT NULL;

CREATE TABLE app_peerreview_responses (
  uri           text PRIMARY KEY,
  cid           text NOT NULL,
  argument_uri  text NOT NULL,
  reviewer_did  text NOT NULL,
  criteria      jsonb,
  vote          text NOT NULL CHECK (vote IN ('APPROVE', 'REJECT')),
  justification text,
  -- Herkunft (ATProto-native Pfad): Referenz auf den user-signierten Original-
  -- Response-Record im Reviewer-Repo (analog app_arguments). NULL für Bestand.
  origin_uri    text,
  origin_cid    text,
  created_at    timestamptz NOT NULL,
  indexed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX app_peerreview_responses_arg_reviewer_uniq
  ON app_peerreview_responses (argument_uri, reviewer_did);
CREATE INDEX app_peerreview_responses_argument_uri_idx ON app_peerreview_responses (argument_uri);
CREATE INDEX app_peerreview_responses_reviewer_did_idx ON app_peerreview_responses (reviewer_did);

-- Per-argument peer-review lifecycle row. One row per user-submitted argument,
-- inserted by the indexer in the same firehose transaction that inserts the
-- argument itself (curated content skips peer review and therefore has no row).
--
-- Lifecycle transitions:
--   open                    : initial state; new reviewers can check in
--   open               → provisional_closed : indexer sets this on the response
--                            that hits `quorum`. New check-ins refused from now
--                            on; already-checked-in users keep submit rights
--                            within the grace window.
--   provisional_closed → closed              : finaliser cron flips this once
--                            grace_until < NOW(); the same SQL writes
--                            app_arguments.review_status from majority vote.
--
-- The grace window slides forward on real reviewer activity (POST
-- .review.activity), so a reviewer who keeps typing is never cut off mid
-- sentence.
CREATE TABLE app_peerreviews (
  argument_uri          text PRIMARY KEY REFERENCES app_arguments(uri) ON DELETE CASCADE,
  state                 text NOT NULL DEFAULT 'open'
    CHECK (state IN ('open', 'provisional_closed', 'closed')),
  quorum                int  NOT NULL,           -- captured at row-creation from env default; per-review configurable
  opened_at             timestamptz NOT NULL DEFAULT now(),
  provisional_closed_at timestamptz,
  grace_until           timestamptz,
  closed_at             timestamptz,
  CONSTRAINT app_peerreviews_grace_when_provisional CHECK (
    (state = 'provisional_closed' AND grace_until IS NOT NULL AND provisional_closed_at IS NOT NULL)
    OR (state <> 'provisional_closed')
  ),
  CONSTRAINT app_peerreviews_closed_at_when_closed CHECK (
    (state = 'closed' AND closed_at IS NOT NULL) OR (state <> 'closed')
  )
);

CREATE INDEX app_peerreviews_state_idx       ON app_peerreviews (state);
-- Finaliser cron's hot path: grab all rows whose grace window has expired.
CREATE INDEX app_peerreviews_grace_until_idx ON app_peerreviews (grace_until)
  WHERE state = 'provisional_closed';

-- Backfill: one row per existing user-submitted argument so the new code can
-- assume "every user-arg has a peerreview row". Arguments that are already
-- decided land directly in 'closed'; the rest become 'open' with the current
-- env-default quorum baked in.
INSERT INTO app_peerreviews (argument_uri, state, quorum, opened_at, closed_at)
SELECT a.uri,
       CASE WHEN a.peerreview_status IN ('approved', 'rejected') THEN 'closed' ELSE 'open' END,
       10,
       a.created_at,
       CASE WHEN a.peerreview_status IN ('approved', 'rejected') THEN a.indexed_at ELSE NULL END
FROM app_arguments a
WHERE a.source_type = 'user' AND NOT a.deleted
ON CONFLICT (argument_uri) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Peer-review submission gate — SINGLE SOURCE OF TRUTH for the DB-state
-- authorization of a review response. Called by BOTH the synchronous appview
-- (submit_review) and the authoritative community-writer (acceptance._accept_response),
-- so the two can never drift. Returns NULL when allowed, else a reason string in
-- FIXED PRIORITY (matches the appview's historical order). Vote-payload validity
-- (APPROVE/REJECT + justification) is NOT a DB-state check and stays in code.
-- SECURITY INVOKER (default): both caller roles already hold SELECT on these tables.
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

CREATE TABLE app_comments (
  uri               text PRIMARY KEY,
  cid               text NOT NULL,
  did               text NOT NULL,
  rkey              text NOT NULL,
  origin            text NOT NULL,          -- 'intern' or 'extern'
  title             text,
  text              text,
  ballot_uri        text NOT NULL,
  ballot_rkey       text NOT NULL,
  parent_uri        text,
  argument_uri      text,                   -- URI of the ancestor argument this comment belongs to (null if direct reply to ballot)
  bsky_post_uri     text,
  bsky_post_cid     text,
  handle            text,
  display_name      text,
  like_count        integer NOT NULL DEFAULT 0,
  bsky_like_count   integer NOT NULL DEFAULT 0,
  bsky_repost_count integer NOT NULL DEFAULT 0,
  bsky_reply_count  integer NOT NULL DEFAULT 0,
  -- Multilingual content: only the original-language declaration lives on
  -- the row. Translations are SIDECAR records (see app_comment_translations
  -- below) because comments live in foreign repos (user or Bluesky) that
  -- POLTR cannot write to.
  langs              text[] NOT NULL DEFAULT ARRAY['de-CH'],
  translation_status text   NOT NULL DEFAULT 'pending'
    CHECK (translation_status IN ('pending', 'partial', 'complete', 'manual_only')),
  created_at        timestamptz NOT NULL,
  indexed_at        timestamptz NOT NULL DEFAULT now(),
  deleted           boolean NOT NULL DEFAULT false
);

CREATE INDEX app_comments_ballot_uri_idx ON app_comments (ballot_uri);
CREATE INDEX app_comments_ballot_rkey_idx ON app_comments (ballot_rkey);
CREATE INDEX app_comments_parent_uri_idx ON app_comments (parent_uri);
CREATE INDEX app_comments_argument_uri_idx ON app_comments (argument_uri);
CREATE INDEX app_comments_did_idx ON app_comments (did);
CREATE INDEX app_comments_translation_status_idx
  ON app_comments (translation_status)
  WHERE NOT deleted AND translation_status IN ('pending', 'partial');
CREATE INDEX app_comments_langs_idx ON app_comments USING GIN (langs);

-- ---------------------------------------------------------------------------
-- Per-user content-creation quota ledger (arguments + comments). Written
-- synchronously by the create handlers so the daily / per-ballot caps are
-- race-free (the app_arguments/app_comments tables lag the firehose).
-- Append-only: deletions do NOT refund quota. See src/routes/deliberation/quota.py.
-- ---------------------------------------------------------------------------
CREATE TABLE app_content_creations (
  id          bigserial PRIMARY KEY,
  did         text NOT NULL,                 -- author DID (session user)
  kind        text NOT NULL CHECK (kind IN ('argument','comment')),
  ballot_rkey text NOT NULL,                 -- CMS ballot ID
  uri         text UNIQUE,                   -- resulting record URI (null until the PDS write returns)
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- One index serves both counts: lifetime via the (did,kind,ballot_rkey) prefix,
-- daily via the trailing created_at.
CREATE INDEX app_content_creations_lookup_idx
  ON app_content_creations (did, kind, ballot_rkey, created_at);

-- ---------------------------------------------------------------------------
-- Sidecar translations for comments. Owned by the ballot's community account
-- on the PDS (NSID: app.ch.poltr.comment.translation), populated here from the
-- firehose. Original comment records stay untouched in their foreign repo.
-- ---------------------------------------------------------------------------
CREATE TABLE app_comment_translations (
  uri           text PRIMARY KEY,    -- AT URI of the sidecar record itself
  cid           text NOT NULL,
  subject_uri   text NOT NULL,        -- AT URI of the comment being translated
  ballot_rkey   text,                  -- denormalized for fast filter
  lang          text NOT NULL,
  body          text NOT NULL,
  source        text NOT NULL CHECK (source IN ('manual', 'ai')),
  model         text,
  translated_at timestamptz NOT NULL,
  indexed_at    timestamptz NOT NULL DEFAULT now(),
  deleted       boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX app_comment_translations_subject_lang_uniq
  ON app_comment_translations (subject_uri, lang) WHERE NOT deleted;
CREATE INDEX app_comment_translations_subject_idx
  ON app_comment_translations (subject_uri) WHERE NOT deleted;
CREATE INDEX app_comment_translations_ballot_rkey_idx
  ON app_comment_translations (ballot_rkey) WHERE NOT deleted;

CREATE TABLE app_activity_seen (
  did            text NOT NULL,
  activity_uri   text NOT NULL,
  seen_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (did, activity_uri)
);

CREATE INDEX idx_activity_seen_did ON app_activity_seen (did);

CREATE TABLE app_profiles (
  did              text PRIMARY KEY,
  display_name     varchar(200),
  mountain_name    varchar(150),
  mountain_fullname varchar(250),
  canton           varchar(20),
  height           numeric(7,1),
  color            varchar(10),
  created_at       timestamptz,
  indexed_at       timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- auth schema: auth tables (appview only, no indexer access)
-- =============================================================================

CREATE TABLE auth.community_accounts (
  did               text PRIMARY KEY,
  handle            text NOT NULL,
  ballot_rkey       text UNIQUE,
  ballot_uri        text UNIQUE,
  pw_ciphertext     bytea NOT NULL,        -- encrypted with APPVIEW_PDS_CREDS_MASTER_KEY_B64
  pw_nonce          bytea NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth.auth_creds (
  did                    text PRIMARY KEY,
  handle                 text NOT NULL,
  -- Peppered HMAC-SHA256 of the normalized email (hex, 64 chars), NOT plaintext.
  -- Pepper = APPVIEW_EMAIL_HMAC_PEPPER_B64, held only in the appview process.
  -- A leaked DB cannot brute-force these without the pepper. UNIQUE so one email
  -- = one account; deterministic so login can look up by digest. The plaintext
  -- address lives only transiently in the auth_pending_* tables (to send mail)
  -- and in the PDS. See services/appview/src/auth/email_hmac.py.
  email_hmac             varchar(255) NOT NULL UNIQUE,
  pds_url                text,
  app_pw_ciphertext      bytea NOT NULL,
  app_pw_nonce           bytea NOT NULL,
  pseudonym_template_id  integer REFERENCES auth.mountain_templates(id)
);

CREATE INDEX idx_auth_creds_email_hmac ON auth.auth_creds (email_hmac);

CREATE TABLE auth.auth_sessions (
  id               serial PRIMARY KEY,
  session_token    varchar(128) NOT NULL UNIQUE,  -- SHA-256 hash of the actual token
  user_data        jsonb,
  expires_at       timestamp NOT NULL,
  created_at       timestamp DEFAULT now(),
  last_accessed_at timestamp DEFAULT now(),
  did              varchar(255)
);

CREATE INDEX idx_auth_sessions_token ON auth.auth_sessions (session_token);
CREATE INDEX idx_auth_sessions_did ON auth.auth_sessions (did);
CREATE INDEX idx_auth_sessions_expires_at ON auth.auth_sessions (expires_at);

CREATE TABLE auth.auth_pending_logins (
  id              serial PRIMARY KEY,
  -- Peppered HMAC of the email (NOT plaintext) — same digest as auth_creds.email_hmac.
  -- The plaintext address is used only transiently to SEND the mail (from the
  -- request body), never stored. See services/appview/src/auth/email_hmac.py.
  -- UNIQUE: ch.poltr.auth.start keeps exactly ONE live code per email and upserts
  -- on this column (mirrors auth_pending_registrations).
  email_hmac      varchar(255) NOT NULL UNIQUE,
  token           varchar(64) NOT NULL UNIQUE,
  short_code      varchar(6),
  failed_attempts integer NOT NULL DEFAULT 0,
  -- Same-origin relative path the user wanted before being sent to login, so we
  -- can redirect back after auth (cross-device; read from this row, not browser).
  return_url      text,
  expires_at      timestamp NOT NULL,
  created_at      timestamp DEFAULT now(),
  -- Per-email send throttle (anti email-bombing). Because start collapses to one
  -- row per email, the per-email window cap is tracked on the row (cf. counting
  -- rows, which the one-live-code collapse defeats). See doc/SECURITY_AUTH.md #2.
  send_count        integer NOT NULL DEFAULT 1,
  window_started_at timestamp NOT NULL DEFAULT now(),
  -- SHA-256 of the initiator secret (httpOnly cookie set at ch.poltr.auth.start).
  -- checkLink compares it to decide same-browser vs different-browser. See #007.
  initiator_id    varchar(64)
);

CREATE INDEX idx_auth_pending_logins_token ON auth.auth_pending_logins (token);
CREATE INDEX idx_auth_pending_logins_expires_at ON auth.auth_pending_logins (expires_at);
CREATE UNIQUE INDEX idx_auth_pending_logins_short_code ON auth.auth_pending_logins (short_code) WHERE short_code IS NOT NULL;

CREATE TABLE auth.auth_pending_registrations (
  id              serial PRIMARY KEY,
  -- Peppered HMAC of the email (NOT plaintext). See auth_pending_logins.email_hmac.
  email_hmac      varchar(255) NOT NULL UNIQUE,
  token           varchar(64) NOT NULL UNIQUE,
  short_code      varchar(6),
  failed_attempts integer NOT NULL DEFAULT 0,
  -- See auth_pending_logins.return_url.
  return_url      text,
  expires_at      timestamp NOT NULL,
  created_at      timestamp DEFAULT now(),
  -- Per-email send throttle (anti email-bombing). Table is UNIQUE(email_hmac) with
  -- upsert, so the per-email window cap is tracked on the row. auth_pending_logins
  -- uses the identical mechanism. See doc/SECURITY_AUTH.md #2.
  send_count        integer NOT NULL DEFAULT 1,
  window_started_at timestamp NOT NULL DEFAULT now(),
  -- See auth_pending_logins.initiator_id.
  initiator_id    varchar(64)
);

CREATE INDEX idx_auth_pending_registrations_token ON auth.auth_pending_registrations (token);
CREATE INDEX idx_auth_pending_registrations_email_hmac ON auth.auth_pending_registrations (email_hmac);
CREATE INDEX idx_auth_pending_registrations_expires_at ON auth.auth_pending_registrations (expires_at);
CREATE UNIQUE INDEX idx_auth_pending_registrations_short_code ON auth.auth_pending_registrations (short_code) WHERE short_code IS NOT NULL;

-- Outbound auth-email ledger for the global hourly circuit breaker (one row per
-- auth email actually sent). The breaker counts rows in the last hour to enforce
-- a platform-wide alert threshold + hard cap. Rows older than 2h are pruned on
-- each insert, so the table stays tiny. See doc/SECURITY_AUTH.md #4.
CREATE TABLE auth.auth_email_sends (
  id         serial PRIMARY KEY,
  purpose    varchar(20) NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX idx_auth_email_sends_created_at ON auth.auth_email_sends (created_at);

CREATE TABLE auth.mountain_templates (
  id        serial PRIMARY KEY,
  name      varchar(150) NOT NULL,
  fullname  varchar(250),
  canton    varchar(20) NOT NULL,
  height    numeric(7,1) NOT NULL
);

-- =============================================================================
-- Views
-- =============================================================================

-- Eligibility-Whitelist für das Gate der internen Schreib-Seite (L3): wer darf in
-- die Community beitragen. Heute = jeder registrierte POLTR-Account. Die interne
-- Seite (Indexer/Writer) prüft Eligibility über diese View, OHNE Email/Credential-
-- Zugriff zu brauchen — Postgres-Views laufen mit den Rechten des View-Owners
-- (allforone), die abfragende Rolle sieht nur (did, eligible). Wahrt das
-- auth-Hardening (Indexer hat KEINEN auth_creds-Zugriff). Ban-/eID-Overlay dockt
-- hier später an (z.B. LEFT JOIN auf eine künftige Sperr-/Verifikationsquelle
-- → eligible=false), ohne dass sich der Konsument ändert.
CREATE OR REPLACE VIEW auth.v_eligible_participants AS
  SELECT did, TRUE AS eligible
  FROM auth.auth_creds;

-- =============================================================================
-- Roles & Grants
-- =============================================================================

-- allforone: full access to both schemas
GRANT USAGE, CREATE ON SCHEMA auth TO allforone;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO allforone;
GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO allforone;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON TABLES TO allforone;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON SEQUENCES TO allforone;

-- indexer: public schema only, no auth access
CREATE ROLE indexer WITH LOGIN PASSWORD 'CHANGE_ME';
GRANT CONNECT ON DATABASE appview TO indexer;
GRANT USAGE ON SCHEMA public TO indexer;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO indexer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO indexer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO indexer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO indexer;
-- Taxonomie-Projektion: der Indexer schreibt den PDS-Snapshot in den Baum — inkl.
-- Löschen von Waisen-Knoten und Ersetzen der Memberships → DELETE nötig (auch für
-- das bestehende cascadeDeleteArgumentDerived auf app_taxonomy_membership).
GRANT DELETE ON app_taxonomy_node, app_taxonomy_membership TO indexer;
REVOKE ALL ON SCHEMA auth FROM indexer;
-- Indexer needs to read community DIDs (but not credentials)
GRANT USAGE ON SCHEMA auth TO indexer;
GRANT SELECT (did, handle, ballot_rkey) ON auth.community_accounts TO indexer;
-- Eligibility-Gate (L3): nur die schmale View, kein auth_creds-Zugriff (Email/Creds
-- bleiben unsichtbar; die View liest auth_creds mit den Rechten ihres Owners).
GRANT SELECT ON auth.v_eligible_participants TO indexer;

-- ALTER ROLE indexer WITH PASSWORD 'CHANGE_ME';

-- calculator: liest app_arguments und den Top-down Themen-Baum. Reines Compute —
-- die /induce|/classify|/grow-Endpoints schreiben NICHTS in die DB; persistiert wird
-- ausschliesslich über den CMS-Taxonomie-Snapshot (PDS → Indexer → node/membership).
-- Daher nur SELECT auf die Taxonomie-Tabellen, kein I/U/D. Kein auth-Zugriff.
CREATE ROLE calculator WITH LOGIN PASSWORD 'CHANGE_ME';
GRANT CONNECT ON DATABASE appview TO calculator;
GRANT USAGE ON SCHEMA public TO calculator;
GRANT SELECT ON app_arguments TO calculator;
GRANT SELECT ON app_taxonomy_node, app_taxonomy_membership TO calculator;
REVOKE ALL ON SCHEMA auth FROM calculator;
-- ALTER ROLE calculator WITH PASSWORD 'CHANGE_ME';

-- =============================================================================
-- Service-Isolation: ozone und cms bekommen EIGENE Login-Rollen statt der
-- geteilten Superuser-Rolle 'allforone'. Damit kann ein kompromittierter
-- Ozone-/CMS-Pod NICHT mehr das komplette auth-Schema der appview-DB lesen.
-- =============================================================================

-- Standardmässig erteilt Postgres CONNECT an PUBLIC — d.h. jede Cluster-Rolle
-- (auch 'ozone') könnte sich mit der appview-DB verbinden. Zudrehen und nur an
-- die berechtigten Rollen explizit vergeben. allforone ist Superuser und umgeht
-- den CONNECT-Check ohnehin; indexer/calculator haben oben bereits GRANT CONNECT.
REVOKE CONNECT ON DATABASE appview FROM PUBLIC;

-- cms: braucht die appview-DB NUR für Community-Account-Creds und den
-- Taxonomie-Snapshot-Dedup-Ledger. Sonst KEIN auth-/public-Zugriff.
-- (Keine Sequence-Grants nötig: community_accounts PK=did text,
--  app_taxonomy_snapshot PK=(ballot_rkey,version) — keine serial-Spalte.)
CREATE ROLE cms WITH LOGIN PASSWORD 'CHANGE_ME';
GRANT CONNECT ON DATABASE appview TO cms;
GRANT USAGE ON SCHEMA auth TO cms;
GRANT SELECT, INSERT ON auth.community_accounts TO cms;
GRANT USAGE ON SCHEMA public TO cms;
GRANT SELECT, INSERT ON app_taxonomy_snapshot TO cms;
-- ALTER ROLE cms WITH PASSWORD 'CHANGE_ME';

-- ozone: spricht NUR mit der 'ozone'-Datenbank. Bewusst KEIN CONNECT auf appview
-- (zusammen mit dem REVOKE ... FROM PUBLIC oben ist die appview-DB unerreichbar).
-- Grants auf die ozone-DB selbst → infra/scripts/postgres/harden-service-roles.sql.
CREATE ROLE ozone WITH LOGIN PASSWORD 'CHANGE_ME';
-- ALTER ROLE ozone WITH PASSWORD 'CHANGE_ME';

-- =============================================================================
-- Pro-Pod-Rollen: appview + writer (ersetzen die geteilte allforone-Rolle für
-- diese Pods). Ziel: KEIN Pod nutzt mehr allforone → allforone wird zum reinen
-- Break-Glass-/DBA-Account. Pro Pod ein eigener User = Blast-Radius-Trennung.
-- =============================================================================

-- appview: der Auth-/API-Dienst. Volle DML auf beide Schemas (Auth + Content),
-- aber KEIN Superuser — kein pg_authid (Passwort-Hashes), kein COPY FROM/TO
-- PROGRAM, kein ALTER ROLE anderer Rollen, kein RLS-Bypass. Das ist der Haupt-
-- gewinn gegenüber allforone.
CREATE ROLE appview WITH LOGIN PASSWORD 'CHANGE_ME';
GRANT CONNECT ON DATABASE appview TO appview;
GRANT USAGE ON SCHEMA public TO appview;
GRANT USAGE ON SCHEMA auth   TO appview;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO appview;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth   TO appview;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO appview;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA auth   TO appview;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO appview;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth   GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO appview;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO appview;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth   GRANT USAGE, SELECT ON SEQUENCES TO appview;
-- Phase 7 (ATProto-native abgeschlossen): die appview-API schreibt keine
-- Community-Records mehr (kein create_/put_community_record, kein Translator) —
-- das tut der writer. Daher community_accounts auf spaltenweises SELECT verengen:
-- kein pw_ciphertext/pw_nonce, kein Write (wie der indexer oben). appview liest
-- daraus nur did/ballot_rkey (ballots.py-JOIN + get_did_for_ballot).
REVOKE ALL ON auth.community_accounts FROM appview;
GRANT SELECT (did, handle, ballot_rkey, ballot_uri) ON auth.community_accounts TO appview;
-- ALTER ROLE appview WITH PASSWORD 'CHANGE_ME';

-- writer: die interne Schreib-Seite (community-writer). Wie der Indexer auf das
-- public-Schema, PLUS Lesezugriff auf die COMMUNITY-CREDENTIALS (pw_ciphertext/
-- pw_nonce) — die entscheidende Differenz zum Projektor/Indexer, der die pw-
-- Spalten NICHT sieht. KEIN Zugriff auf User-Identität (auth_creds/Sessions).
CREATE ROLE writer WITH LOGIN PASSWORD 'CHANGE_ME';
GRANT CONNECT ON DATABASE appview TO writer;
GRANT USAGE ON SCHEMA public TO writer;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO writer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO writer;
GRANT USAGE ON SCHEMA auth TO writer;
GRANT SELECT ON auth.community_accounts TO writer;        -- inkl. pw_* → Community-Sessions
GRANT SELECT ON auth.v_eligible_participants TO writer;     -- Eligibility-Gate

-- =============================================================================
-- app_embeddings — pgvector embeddings für Argumente + Taxonomie-Nodes (LM-
-- assisted Duplikatscheck + semantische Suche). Vom Calculator geschrieben
-- (sein erster DB-Write); regenerierbarer Cache, daher kein FK → kein CASCADE.
-- Siehe doc/LM_PEER_REVIEW.md. Voraussetzung: pgvector-fähiges Postgres-Image
-- (custom postgres:15-alpine + pgvector, infra/docker/postgres-pgvector/).
-- (Spiegelt services/appview/migrations/012_create_app_embeddings.sql.)
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS app_embeddings (
    subject_type  text NOT NULL,              -- 'argument' | 'taxonomy_node' (später 'comment','ballot')
    subject_ref   text NOT NULL,              -- app_arguments.uri  bzw.  app_taxonomy_node.id::text
    lang          text NOT NULL,              -- kanonischer POLTR_LANGUAGES-Code: 'de-CH','en-GB',…
    scope_rkey    text,                       -- ballot_rkey für Vorlagen-Filter (Dedup)
    model         text NOT NULL,
    embedding     vector(1024) NOT NULL,      -- dimensions=1024 (MRL)
    content_hash  text NOT NULL,              -- sha256(model || dim || text) je Sprache
    generated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (subject_type, subject_ref, lang)
);
CREATE INDEX IF NOT EXISTS app_embeddings_scope_idx
    ON app_embeddings (subject_type, scope_rkey, lang);

GRANT SELECT, INSERT, UPDATE, DELETE ON app_embeddings TO calculator;
GRANT SELECT ON app_embeddings TO appview;
-- ALTER ROLE writer WITH PASSWORD 'CHANGE_ME';