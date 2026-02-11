-- # CREATING TABLES
CREATE TABLE app_ballots (
  uri         text PRIMARY KEY,   -- at://did/.../app.ch.poltr.vote.proposal/...
  cid         text NOT NULL,
  did         text NOT NULL,      -- repo DID (actor)
  rkey        text NOT NULL,      -- record key
  title       text,
  description text,
  vote_date   timestamptz,
  created_at  timestamptz NOT NULL,
  indexed_at  timestamptz NOT NULL DEFAULT now(),
  deleted     boolean NOT NULL DEFAULT false
);

CREATE INDEX app_ballots_vote_date_idx
  ON app_ballots (vote_date);

CREATE INDEX app_ballots_did_idx
  ON app_ballots (did);
