-- Duplikat-Kriterium (retrospektiv): max. Cosine-Ähnlichkeit jedes User-Arguments
-- zu einem ANDEREN Argument GLEICHER Position derselben Vorlage (663.1, de-CH).
-- Vergleichspool = alle nicht-gelöschten Argumente der Vorlage (user + amtlich).
-- Flag als mögliches Duplikat bei max_sim >= 0.66 (CALCULATOR_DEDUP_SIM_THRESHOLD).
WITH base AS (
  SELECT a.uri, a.type, a.title, e.embedding
  FROM app_arguments a
  JOIN app_embeddings e ON e.subject_ref=a.uri AND e.subject_type='argument' AND e.lang='de-CH'
  WHERE a.ballot_rkey='663.1' AND a.deleted=false AND a.source_type='user'
),
pool AS (
  SELECT a.uri, a.type, e.embedding
  FROM app_arguments a
  JOIN app_embeddings e ON e.subject_ref=a.uri AND e.subject_type='argument' AND e.lang='de-CH'
  WHERE a.ballot_rkey='663.1' AND a.deleted=false
)
SELECT b.uri, b.type,
  round((SELECT max(1 - (p.embedding <=> b.embedding))
         FROM pool p WHERE p.uri<>b.uri AND p.type=b.type)::numeric, 3) AS max_sim,
  b.title
FROM base b ORDER BY max_sim DESC;
