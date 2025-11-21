import 'dotenv/config';
import { Pool } from 'pg';
export const pool = new Pool({
    connectionString: process.env.APPVIEW_POSTGRES_URL,
});
export async function closePool() {
    await pool.end();
}
export async function dbQuery(clientOrPool, text, params = []) {
    if (!clientOrPool)
        throw new Error('No DB client/pool provided');
    return clientOrPool.query(text, params);
}
// Example typed helpers (commented) — uncomment and adapt as needed.
// export async function upsertProposalDb(
//   clientOrPool: Pool | PoolClient,
//   params: { uri: string; cid: string; did: string; rkey: string; record: any },
// ) {
//   // ... implementation
// }
