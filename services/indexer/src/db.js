// Use runtime pg client; do not import from @types which is types-only.
import { Pool } from 'pg'

export const pool = new Pool({
  connectionString: process.env.APPVIEW_POSTGRES_URL || 'indexer',
})

export async function closePool() {
  await pool.end()
}
