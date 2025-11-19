import { pool } from './db.js'

export async function getCursor(id) {
  const res = await pool.query(
    'SELECT cursor, metadata, updated_at FROM backfill_cursors WHERE id = $1',
    [id]
  )
  // Return a consistent object shape. If no row, return { cursor: null, metadata: {} }
  return res.rows[0] ?? { cursor: null, metadata: {} }
}

export async function setCursor(id, cursor, metadata = {}) {
  await pool.query(
    `INSERT INTO backfill_cursors (id, cursor, metadata)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET
       cursor = EXCLUDED.cursor,
       metadata = EXCLUDED.metadata,
       updated_at = now()`,
    [id, cursor, metadata]
  )
}
// Note: withCursorLock removed for a simpler sequential implementation.