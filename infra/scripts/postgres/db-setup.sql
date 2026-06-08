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
  did           text NOT NULL,          -- repo DID (governance account)
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
  -- Multilingual content: original languages (BCP-47, Bluesky-compatible `langs` array)
  -- plus inline translations. translation_status drives the background worker queue.
  langs              text[] NOT NULL DEFAULT ARRAY['de'],
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
CREATE TABLE app_topic_node (              -- Adjazenzliste: parent_id → Elternknoten (NULL = Wurzel)
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ballot_rkey  text NOT NULL,
  parent_id    bigint REFERENCES app_topic_node(id) ON DELETE CASCADE,
  key          text,                  -- langlebiger Slug (mit '-'); set-once, für Permalinks
  name         text NOT NULL,
  description  text,                  -- 1 Satz, was darunterfällt — Kontext für den LLM-Klassifikator
  introduction text,                  -- voter-facing: warum das Thema zählt & für wen (Stimmbürgerschaft) — im Frontend gezeigt
  depth        integer NOT NULL DEFAULT 0,
  importance   smallint CHECK (importance IS NULL OR importance BETWEEN 1 AND 5),  -- LLM-Prior 1–5 (nur CMS)
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX app_topic_node_ballot_idx ON app_topic_node (ballot_rkey);
CREATE INDEX app_topic_node_parent_idx ON app_topic_node (parent_id);
CREATE UNIQUE INDEX app_topic_node_key_uidx ON app_topic_node (ballot_rkey, key) WHERE key IS NOT NULL;

CREATE TABLE app_topic_membership (       -- Argument → Knoten (Einheit = Argument; genau EIN Knoten pro Argument)
  ballot_rkey  text NOT NULL,
  node_id      bigint NOT NULL REFERENCES app_topic_node(id) ON DELETE CASCADE,
  argument_uri text NOT NULL,
  confidence   smallint CHECK (confidence IS NULL OR confidence BETWEEN 1 AND 5),  -- Klassifikator-Sicherheit 1–5
  stance       text CHECK (stance IN ('pro','contra')),  -- = app_arguments.type (PRO/CONTRA), keine Analyse
  code         text,                            -- optionale, vestigiale Provenienz-Spalte (heute ungenutzt)
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ballot_rkey, argument_uri, node_id)
);
CREATE INDEX app_topic_membership_node_idx ON app_topic_membership (node_id);
CREATE UNIQUE INDEX app_topic_membership_arg_uidx          -- genau EIN Knoten pro Argument
  ON app_topic_membership (ballot_rkey, argument_uri);

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
  langs              text[] NOT NULL DEFAULT ARRAY['de'],
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
-- Sidecar translations for comments. Owned by the ballot's governance account
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

CREATE TABLE auth.governance_accounts (
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
  email                  varchar(255) NOT NULL UNIQUE,
  pds_url                text,
  app_pw_ciphertext      bytea NOT NULL,
  app_pw_nonce           bytea NOT NULL,
  pseudonym_template_id  integer REFERENCES auth.mountain_templates(id)
);

CREATE INDEX idx_auth_creds_email ON auth.auth_creds (email);

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
  email           varchar(255) NOT NULL,
  token           varchar(64) NOT NULL UNIQUE,
  short_code      varchar(6),
  failed_attempts integer NOT NULL DEFAULT 0,
  expires_at      timestamp NOT NULL,
  created_at      timestamp DEFAULT now()
);

CREATE INDEX idx_auth_pending_logins_token ON auth.auth_pending_logins (token);
CREATE INDEX idx_auth_pending_logins_email ON auth.auth_pending_logins (email);
CREATE INDEX idx_auth_pending_logins_expires_at ON auth.auth_pending_logins (expires_at);
CREATE UNIQUE INDEX idx_auth_pending_logins_short_code ON auth.auth_pending_logins (short_code) WHERE short_code IS NOT NULL;

CREATE TABLE auth.auth_pending_registrations (
  id              serial PRIMARY KEY,
  email           varchar(255) NOT NULL UNIQUE,
  token           varchar(64) NOT NULL UNIQUE,
  short_code      varchar(6),
  failed_attempts integer NOT NULL DEFAULT 0,
  expires_at      timestamp NOT NULL,
  created_at      timestamp DEFAULT now()
);

CREATE INDEX idx_auth_pending_registrations_token ON auth.auth_pending_registrations (token);
CREATE INDEX idx_auth_pending_registrations_email ON auth.auth_pending_registrations (email);
CREATE INDEX idx_auth_pending_registrations_expires_at ON auth.auth_pending_registrations (expires_at);
CREATE UNIQUE INDEX idx_auth_pending_registrations_short_code ON auth.auth_pending_registrations (short_code) WHERE short_code IS NOT NULL;

CREATE TABLE auth.mountain_templates (
  id        serial PRIMARY KEY,
  name      varchar(150) NOT NULL,
  fullname  varchar(250),
  canton    varchar(20) NOT NULL,
  height    numeric(7,1) NOT NULL
);

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
REVOKE ALL ON SCHEMA auth FROM indexer;
-- Indexer needs to read governance DIDs (but not credentials)
GRANT USAGE ON SCHEMA auth TO indexer;
GRANT SELECT (did, handle, ballot_rkey) ON auth.governance_accounts TO indexer;

-- ALTER ROLE indexer WITH PASSWORD 'CHANGE_ME';

-- calculator: liest app_arguments, baut/pflegt die Top-down Themen-Hierarchie.
-- Kein auth-Zugriff, keine Schreibrechte auf den übrigen Content.
CREATE ROLE calculator WITH LOGIN PASSWORD 'CHANGE_ME';
GRANT CONNECT ON DATABASE appview TO calculator;
GRANT USAGE ON SCHEMA public TO calculator;
GRANT SELECT ON app_arguments TO calculator;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  app_topic_node, app_topic_membership
  TO calculator;
REVOKE ALL ON SCHEMA auth FROM calculator;
-- ALTER ROLE calculator WITH PASSWORD 'CHANGE_ME';