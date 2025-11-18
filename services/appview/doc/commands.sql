-- # CREATING TABLES
CREATE TABLE poltr_vote_proposal (
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

CREATE INDEX poltr_vote_proposal_vote_date_idx
  ON poltr_vote_proposal (vote_date);

CREATE INDEX poltr_vote_proposal_did_idx
  ON poltr_vote_proposal (did);
