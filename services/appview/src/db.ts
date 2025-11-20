import 'dotenv/config'
import type { QueryConfig, QueryResult } from 'pg'
import { Pool } from 'pg'

export const pool = new Pool({
  connectionString: process.env.APPVIEW_POSTGRES_URL,
})

export async function closePool(): Promise<void> {
  await pool.end()
}

/**
 * Helper: perform safe DB query with provided client or pool.
 * Accepts either a `Pool` or `PoolClient` instance.
 */
type Queryable = { query: (text: string | QueryConfig, params?: unknown[]) => Promise<QueryResult> }

export async function dbQuery(
  clientOrPool: Queryable,
  text: string | QueryConfig,
  params: unknown[] = [],
): Promise<QueryResult> {
  if (!clientOrPool) throw new Error('No DB client/pool provided')
  return clientOrPool.query(text, params)
}

// Example typed helpers (commented) — uncomment and adapt as needed.
// export async function upsertProposalDb(
//   clientOrPool: Pool | PoolClient,
//   params: { uri: string; cid: string; did: string; rkey: string; record: any },
// ) {
//   // ... implementation
// }

