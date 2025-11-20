import Fastify from 'fastify';
import { pool } from './db';
const fastify = Fastify();
async function checkDbConnection() {
    try {
        await pool.query('SELECT 1');
        console.log('DB connection ok');
    }
    catch (err) {
        console.error('DB connection failed:', err);
        process.exit(1);
    }
}
fastify.get('/healthz', async (request, reply) => {
    try {
        await pool.query('SELECT 1');
        return reply.status(200).send({ status: 'ok' });
    }
    catch (err) {
        return reply.status(503).send({ status: 'error', error: String(err) });
    }
});
fastify.get('/xrpc/app.ch.poltr.vote.listProposals', async (req, reply) => {
    const { did, since, limit = 50 } = req.query;
    const params = [];
    const where = ['deleted = false'];
    if (did) {
        params.push(did);
        where.push(`did = $${params.length}`);
    }
    if (since) {
        params.push(new Date(since));
        where.push(`vote_date >= $${params.length}`);
    }
    params.push(Number(limit));
    const sql = `
    SELECT *
    FROM poltr_vote_proposal
    WHERE ${where.join(' AND ')}
    ORDER BY vote_date DESC NULLS LAST, created_at DESC
    LIMIT $${params.length}
  `;
    try {
        const result = await pool.query(sql, params);
        return reply.status(200).send({ proposals: result.rows });
    }
    catch (err) {
        req.log.error({ err }, 'DB query failed');
        return reply.status(500).send({ error: 'internal_error', details: String(err) });
    }
});
async function start() {
    await checkDbConnection();
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('API listening on :3000');
}
start().catch((err) => {
    console.error('Failed to start server', err);
    process.exit(1);
});
