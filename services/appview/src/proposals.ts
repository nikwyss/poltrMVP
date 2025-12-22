import { FastifyReply, FastifyRequest } from 'fastify'
import type { QueryResult } from 'pg'
import { pool } from './db.js'
import { encodeCursor } from './cursor.js'
import { DBRow, getArray, getDateISO, getNumber, getObject, getString } from './lib.js'
import { Author, Proposal, ProposalRecord } from './typing.js'

type ListProposalsQuery = {
    did?: string
    since?: string
    limit?: string | number
}


export const getProposalsHandler = async (
    req: FastifyRequest<{ Querystring: ListProposalsQuery }>,
    reply: FastifyReply,
) => {

    // TODO: authenticate / authorize
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
        const proposals: Proposal[] = result.rows.map((r: DBRow) => {
            // record may be stored as JSON or as separate columns
            let record: ProposalRecord = {}
            const rawRecord = getObject(r, 'record') ?? null
            if (rawRecord) {
                record = rawRecord as ProposalRecord
            } else if (typeof r['record'] === 'string') {
                try {
                    record = JSON.parse(r['record'] as string) as ProposalRecord
                } catch (e) {
                    record = {}
                }
            } else {
                // Build record object, omitting keys with null or undefined values
                const rawRecord: ProposalRecord = {
                    $type: getString(r, 'record_type') ?? getString(r, 'type') ?? 'app.ch.poltr.vote.proposal',
                    title: getString(r, 'title'),
                    description: getString(r, 'description'),
                    voteDate: getDateISO(r, 'vote_date'),
                    createdAt: getDateISO(r, 'created_at'),
                    deleted: Boolean(r['deleted']),
                }
                // Remove keys with null or undefined values
                record = Object.fromEntries(
                    Object.entries(rawRecord).filter(([_, v]) => v !== null && v !== undefined)
                ) as ProposalRecord
            }

            const authorObj = getObject(r, 'author')
            // Build the author object without null attributes
            const authorRaw: Author = {
                did: getString(r, 'author_did') ?? getString(r, 'did') ?? (authorObj && getString(authorObj, 'did')) ?? null,
                handle: getString(r, 'author_handle') ?? getString(r, 'handle') ?? (authorObj && getString(authorObj, 'handle')) ?? null,
                displayName: (authorObj && getString(authorObj, 'displayName')) ?? getString(r, 'author_display_name') ?? null,
                avatar: (authorObj && getString(authorObj, 'avatar')) ?? getString(r, 'author_avatar') ?? null,
                labels: getArray(r, 'author_labels') ?? (authorObj && (authorObj['labels'] as unknown[])) ?? [],
                viewer: (authorObj && authorObj['viewer']) ?? null,
            }

            // Remove keys with null values
            const author = Object.fromEntries(
                Object.entries(authorRaw).filter(([_, v]) => v !== null)
            ) as Author

            // Build the proposal object, omitting keys with null values
            const proposalRaw: Proposal = {
                uri: getString(r, 'uri') ?? getString(r, 'row_uri') ?? '',
                cid: getString(r, 'cid') ?? '',
                author,
                record,
                indexedAt: getDateISO(r, 'indexed_at'),
                likeCount: getNumber(r, 'like_count'),
                replyCount: getNumber(r, 'reply_count'),
                bookmarkCount: getNumber(r, 'bookmark_count'),
                labels: getArray(r, 'labels'),
                viewer: r['viewer'] ?? null,
            }

            // Remove keys with null values (except for required fields)
            const proposal = Object.fromEntries(
                Object.entries(proposalRaw).filter(([k, v]) => v !== null)
            ) as Proposal

            return proposal
        })

        // TODO: add sort modes later..
        const lastIndexed = proposals.length > 0 ? (proposals[proposals.length - 1].indexedAt ?? '') : ''
        const cursor = proposals.length > 0 ? encodeCursor({ sort: 'newest', p: lastIndexed, r: '' }) : null

        return reply.status(200).send({ cursor, proposals })
    } catch (err) {
        req.log.error({ err }, 'DB query failed')
        return reply.status(500).send({ error: 'internal_error', details: String(err) })
    }
}