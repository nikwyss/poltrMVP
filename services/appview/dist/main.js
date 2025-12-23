import Fastify from 'fastify';
import { pool } from './db.js';
import { getProposalsHandler } from './proposals.js';
import cors from '@fastify/cors';
const fastify = Fastify();
// Enable CORS for development (allow all origins). In production, set specific origins.
void fastify.register(cors, { origin: true });
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
fastify.get('/xrpc/app.ch.poltr.vote.listProposals', getProposalsHandler);
async function start() {
    await checkDbConnection();
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('API listening on :3000');
}
start().catch((err) => {
    console.error('Failed to start server', err);
    process.exit(1);
});
