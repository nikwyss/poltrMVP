import { Pool } from 'pg';
export const pool = new Pool({
    connectionString: process.env.APPVIEW_POSTGRES_URL,
});
console.log('Database pool created', process.env.APPVIEW_POSTGRES_URL);
export async function closePool() {
    await pool.end();
}
