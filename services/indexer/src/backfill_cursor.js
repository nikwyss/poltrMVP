import { pool } from './db.js'

export async function getCursor(id) {
  const res = await pool.query(
    'SELECT cursor, metadata, updated_at FROM backfill_cursors WHERE id = $1',
    [id]
  )
  return res.rows[0] || null
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

export async function withCursorLock(id, fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await client.query(
      `INSERT INTO backfill_cursors (id, cursor)
       VALUES ($1, NULL)
       ON CONFLICT (id) DO NOTHING`,
      [id]
    )

    const res = await client.query(
      'SELECT cursor, metadata FROM backfill_cursors WHERE id = $1 FOR UPDATE',
      [id]
    )
    const row = res.rows[0] || { cursor: null, metadata: {} }

    // Call fn with the current cursor and a client so caller can do transactional writes if desired.
    // fn should return the new cursor (string|null) or null if unchanged.
    const newCursor = await fn(row.cursor, row.metadata, client)

    if (typeof newCursor === 'string' || newCursor === null) {
      await client.query(
        `UPDATE backfill_cursors
         SET cursor = $2, metadata = $3, updated_at = now()
         WHERE id = $1`,
        [id, newCursor, row.metadata || {}]
      )
    }

    await client.query('COMMIT')
    return newCursor
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}