import 'dotenv/config'
import { Pool } from 'pg'
import process from 'node:process'

export const pool = new Pool({
  connectionString: process.env.APPVIEW_POSTGRES_URL,
})

export async function closePool() {
  await pool.end()
}


/**
 * Helper: perform safe DB query with provided client or pool.
 */
export async function dbQuery(clientOrPool, text, params = []) {
  if (!clientOrPool) throw new Error('No DB client/pool provided')
  return clientOrPool.query(text, params)
}



/**
 * Upsert a ballot record into poltr_vote_proposal.
 * Uses the given client (transactional) or pool.
 */
export async function upsertBallotDb(clientOrPool, params) {
  const { uri, cid, did, rkey, record } = params

  const title = record.title ?? null
  const description = record.description ?? null
  const voteDate = record.voteDate ? new Date(record.voteDate) : null
  const createdAt = record.createdAt ? new Date(record.createdAt) : new Date()

  await dbQuery(
    clientOrPool,
    `
    INSERT INTO poltr_vote_proposal
      (uri, cid, did, rkey, title, description, vote_date, created_at, deleted)
    VALUES
      ($1,  $2,  $3,  $4,  $5,    $6,          $7,        $8,        false)
    ON CONFLICT (uri) DO UPDATE SET
      cid         = EXCLUDED.cid,
      title       = EXCLUDED.title,
      description = EXCLUDED.description,
      vote_date   = EXCLUDED.vote_date,
      created_at  = EXCLUDED.created_at,
      deleted     = false,
      indexed_at  = now()
    `,
    [uri, cid, did, rkey, title, description, voteDate, createdAt],
  )
}


export async function markDeleted(uri) {
  await pool.query(
    `UPDATE poltr_vote_proposal
     SET deleted = true, indexed_at = now()
     WHERE uri = $1`,
    [uri],
  )
}
