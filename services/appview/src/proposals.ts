import { FastifyReply, FastifyRequest } from 'fastify'
import type { QueryResult } from 'pg'
import { pool } from './db'

type ListProposalsQuery = {
    did?: string
    since?: string
    limit?: string | number
}


export const getProposalsHandler = async (
    req: FastifyRequest<{ Querystring: ListProposalsQuery }>,
    reply: FastifyReply,
) => {
    const { did, since, limit = 50 } = req.query
    const params: Array<string | number | Date> = []
    const where: string[] = ['deleted = false']

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
        LIMIT $${params.length};
    `

    try {
        const result: QueryResult = await pool.query(sql, params)
        return reply.status(200).send({ proposals: result.rows })
    } catch (err) {
        req.log.error({ err }, 'DB query failed')
        return reply.status(500).send({ error: 'internal_error', details: String(err) })
    }
}