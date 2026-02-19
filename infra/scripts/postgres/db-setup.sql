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
  like_count  integer NOT NULL DEFAULT 0,
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
  did           text NOT NULL,          -- repo DID (author)
  rkey          text NOT NULL,          -- record key
  title         text NOT NULL,
  body          text NOT NULL,
  type          text NOT NULL,          -- 'PRO' or 'CONTRA'
  ballot_uri    text NOT NULL,          -- AT URI of the ballot entry
  ballot_rkey   text NOT NULL,          -- rkey of the ballot (for fast lookups)
  bsky_post_uri text,                -- URI of the cross-posted app.bsky.feed.post
  bsky_post_cid text,                -- CID of the cross-posted app.bsky.feed.post
  like_count    integer NOT NULL DEFAULT 0,
  comment_count integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL,
  indexed_at    timestamptz NOT NULL DEFAULT now(),
  deleted       boolean NOT NULL DEFAULT false
);

CREATE INDEX app_arguments_ballot_uri_idx  ON app_arguments (ballot_uri);
CREATE INDEX app_arguments_ballot_rkey_idx ON app_arguments (ballot_rkey);
CREATE INDEX app_arguments_did_idx         ON app_arguments (did);
CREATE INDEX app_arguments_type_idx        ON app_arguments (type);

CREATE TABLE app_comments (
  uri               text PRIMARY KEY,
  cid               text NOT NULL,
  did               text NOT NULL,
  rkey              text NOT NULL,
  origin            text NOT NULL,          -- 'intern' or 'extern'
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
  created_at        timestamptz NOT NULL,
  indexed_at        timestamptz NOT NULL DEFAULT now(),
  deleted           boolean NOT NULL DEFAULT false
);

CREATE INDEX app_comments_ballot_uri_idx ON app_comments (ballot_uri);
CREATE INDEX app_comments_ballot_rkey_idx ON app_comments (ballot_rkey);
CREATE INDEX app_comments_parent_uri_idx ON app_comments (parent_uri);
CREATE INDEX app_comments_argument_uri_idx ON app_comments (argument_uri);
CREATE INDEX app_comments_did_idx ON app_comments (did);

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
  session_token    varchar(128) NOT NULL UNIQUE,
  user_data        jsonb,
  expires_at       timestamp NOT NULL,
  created_at       timestamp DEFAULT now(),
  last_accessed_at timestamp DEFAULT now(),
  access_token     text,
  refresh_token    text,
  did              varchar(255)
);

CREATE INDEX idx_auth_sessions_token ON auth.auth_sessions (session_token);
CREATE INDEX idx_auth_sessions_did ON auth.auth_sessions (did);
CREATE INDEX idx_auth_sessions_expires_at ON auth.auth_sessions (expires_at);

CREATE TABLE auth.auth_pending_logins (
  id         serial PRIMARY KEY,
  email      varchar(255) NOT NULL,
  token      varchar(64) NOT NULL UNIQUE,
  expires_at timestamp NOT NULL,
  created_at timestamp DEFAULT now()
);

CREATE INDEX idx_auth_pending_logins_token ON auth.auth_pending_logins (token);
CREATE INDEX idx_auth_pending_logins_email ON auth.auth_pending_logins (email);
CREATE INDEX idx_auth_pending_logins_expires_at ON auth.auth_pending_logins (expires_at);

CREATE TABLE auth.auth_pending_registrations (
  id         serial PRIMARY KEY,
  email      varchar(255) NOT NULL UNIQUE,
  token      varchar(64) NOT NULL UNIQUE,
  expires_at timestamp NOT NULL,
  created_at timestamp DEFAULT now()
);

CREATE INDEX idx_auth_pending_registrations_token ON auth.auth_pending_registrations (token);
CREATE INDEX idx_auth_pending_registrations_email ON auth.auth_pending_registrations (email);
CREATE INDEX idx_auth_pending_registrations_expires_at ON auth.auth_pending_registrations (expires_at);

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


-- Allow indexer to read user PDS credentials for Bluesky cross-likes
-- TODO: look into this
GRANT USAGE ON SCHEMA auth TO indexer;
GRANT SELECT ON auth.auth_creds TO indexer;


-- ALTER ROLE indexer WITH PASSWORD 'CHANGE_ME';