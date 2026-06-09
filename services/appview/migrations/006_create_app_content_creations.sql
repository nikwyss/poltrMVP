-- Per-user content-creation quota ledger (arguments + comments). Written
-- synchronously by the create handlers so the daily / per-ballot caps are
-- race-free, unlike the indexer-populated app_arguments/app_comments (which lag
-- the firehose). Append-only: deletions do NOT refund quota.
-- Enforced in src/routes/deliberation/quota.py.
CREATE TABLE IF NOT EXISTS public.app_content_creations (
  id          bigserial PRIMARY KEY,
  did         text NOT NULL,                 -- author DID (session user)
  kind        text NOT NULL CHECK (kind IN ('argument','comment')),
  ballot_rkey text NOT NULL,                 -- CMS ballot ID
  uri         text UNIQUE,                   -- resulting record URI (null until PDS write returns)
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- One index serves both counts: lifetime via the (did,kind,ballot_rkey) prefix,
-- daily via the trailing created_at.
CREATE INDEX IF NOT EXISTS app_content_creations_lookup_idx
  ON public.app_content_creations (did, kind, ballot_rkey, created_at);

-- Backfill from already-indexed content so existing users' per-ballot lifetime
-- totals are correct from day one. Idempotent via the uri unique constraint.
INSERT INTO public.app_content_creations (did, kind, ballot_rkey, uri, created_at)
SELECT author_did, 'argument', ballot_rkey, uri, created_at
FROM public.app_arguments
WHERE source_type = 'user' AND author_did IS NOT NULL
ON CONFLICT (uri) DO NOTHING;

INSERT INTO public.app_content_creations (did, kind, ballot_rkey, uri, created_at)
SELECT did, 'comment', ballot_rkey, uri, created_at
FROM public.app_comments
WHERE origin = 'intern'
ON CONFLICT (uri) DO NOTHING;
