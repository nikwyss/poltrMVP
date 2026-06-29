-- app_embeddings: pgvector embeddings for arguments + taxonomy nodes, backing the
-- LM-assisted duplicate check and semantic search. See doc/LM_PEER_REVIEW.md.
--
-- Owned/written by the calculator (its first DB write). A regenerable,
-- non-federated derived cache → no FK (polymorphic subject_ref) and thus no
-- ON DELETE CASCADE; stale rows are harmless (queries JOIN the source + filter
-- deleted) and cleaned lazily by the backfill.
--
-- PREREQUISITE: the postgres image must include pgvector — custom
-- postgres:15-alpine + pgvector (infra/docker/postgres-pgvector/Dockerfile),
-- NOT the Debian pgvector/pgvector image (incompatible with the existing
-- alpine-created volume; see doc/LM_PEER_REVIEW.md).
-- Idempotent (IF NOT EXISTS); GRANT is idempotent in Postgres.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS app_embeddings (
    subject_type  text NOT NULL,              -- 'argument' | 'taxonomy_node' (later 'comment','ballot')
    subject_ref   text NOT NULL,              -- app_arguments.uri  or  app_taxonomy_node.id::text
    lang          text NOT NULL,              -- canonical POLTR_LANGUAGES code: 'de-CH','en-GB',…
    scope_rkey    text,                       -- ballot_rkey, for per-ballot filtering (dedup)
    model         text NOT NULL,              -- e.g. 'Qwen/Qwen3-Embedding-8B'
    embedding     vector(1024) NOT NULL,      -- dimensions=1024 (MRL); matches CALCULATOR_EMBEDDING_DIMENSIONS
    content_hash  text NOT NULL,              -- sha256(model || dim || text) per lang → re-embed only on change
    generated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (subject_type, subject_ref, lang)
);

CREATE INDEX IF NOT EXISTS app_embeddings_scope_idx
    ON app_embeddings (subject_type, scope_rkey, lang);
-- ANN index optional (small N per ballot). For a growing global search corpus,
-- add (pgvector indexes `vector` up to 2000 dims, so 1024 is fine):
--   CREATE INDEX ON app_embeddings USING hnsw (embedding vector_cosine_ops);

-- calculator owns the table (its first write grant; app_arguments stays read-only).
GRANT SELECT, INSERT, UPDATE, DELETE ON app_embeddings TO calculator;
GRANT SELECT ON app_embeddings TO appview;
