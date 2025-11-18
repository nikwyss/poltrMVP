import Fastify from 'fastify'
import { pool } from './db.js' // reuse pool from above

const fastify = Fastify()

// list proposals (e.g. by date, by DID)
fastify.get('/xrpc/app.ch.poltr.vote.listProposals', async (req, reply) => {
  const { did, since, limit = 50 } = req.query
  const params = []
  const where = ['deleted = false']

  if (did) {
    params.push(did)
    where.push(`did = $${params.length}`)
  }

  if (since) {
    params.push(new Date(since))
    where.push(`vote_date >= $${params.length}`)
  }

  params.push(Number(limit))
  const sql = `
    SELECT *
    FROM poltr_vote_proposal
    WHERE ${where.join(' AND ')}
    ORDER BY vote_date DESC NULLS LAST, created_at DESC
    LIMIT $${params.length}
  `
  const { rows } = await pool.query(sql, params)

  // shape response roughly like an XRPC collection if you like
  return { proposals: rows }
})

fastify.listen({ port: 3000, host: '0.0.0.0' }).then(() => {
  console.log('API listening on :3000')
})
