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



CREATE TABLE IF NOT EXISTS indexer_cursors (
  id            text PRIMARY KEY,      -- logical cursor id, e.g. 'firehose:repo-sync' or 'backfill:my-service'
  cursor        text,                  -- opaque cursor string (base64 / JSON / whatever)
  metadata      jsonb DEFAULT '{}'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS indexer_cursors_updated_at_idx ON indexer_cursors (updated_at);


-- // getCursor.js
-- async function getCursor(pool, id) {
--   const res = await pool.query(
--     'SELECT cursor, metadata, updated_at FROM indexer_cursors WHERE id = $1',
--     [id]
--   );
--   return res.rows[0] || null;
-- }

-- async function setCursor(pool, id, cursor, metadata = {}) {
--   await pool.query(
--     `INSERT INTO indexer_cursors (id, cursor, metadata)
--      VALUES ($1, $2, $3)
--      ON CONFLICT (id) DO UPDATE
--        SET cursor = EXCLUDED.cursor,
--            metadata = EXCLUDED.metadata,
--            updated_at = now()`,
--     [id, cursor, metadata]
--   );
-- }


-- // withCursorLock.js
-- async function withCursorLock(pool, id, fn) {
--   const client = await pool.connect();
--   try {
--     await client.query('BEGIN');

--     // Ensure a row exists so FOR UPDATE will lock it (if it doesn't exist, insert a null cursor)
--     await client.query(
--       `INSERT INTO indexer_cursors (id, cursor)
--        VALUES ($1, NULL)
--        ON CONFLICT (id) DO NOTHING`,
--       [id]
--     );

--     // Lock the row
--     const res = await client.query(
--       'SELECT cursor, metadata FROM indexer_cursors WHERE id = $1 FOR UPDATE',
--       [id]
--     );
--     const current = res.rows[0] || { cursor: null, metadata: {} };

--     // Run user-provided function which should perform the backfill and return the new cursor
--     // fn(currentCursor, currentMetadata, client) => newCursor (string)
--     const newCursor = await fn(current.cursor, current.metadata, client);

--     // Persist new cursor
--     await client.query(
--       `UPDATE indexer_cursors
--        SET cursor = $2, metadata = $3, updated_at = now()
--        WHERE id = $1`,
--       [id, newCursor, current.metadata || {}]
--     );

--     await client.query('COMMIT');
--     return newCursor;
--   } catch (err) {
--     await client.query('ROLLBACK');
--     throw err;
--   } finally {
--     client.release();
--   }
-- -- }


-- const BACKFILL_ID = 'backfill:firehose-missed';

-- // run once, or in a loop
-- await withCursorLock(pool, BACKFILL_ID, async (currentCursor, metadata, client) => {
--   // perform fetching of missed records from PDS using currentCursor
--   // process records (insert into your app tables using `client` if you want to keep it transactional)
--   // return the new cursor value after processing
--   const newCursor = await myBackfillProcess(currentCursor, client);
--   return newCursor;
-- });