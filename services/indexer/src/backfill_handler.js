import 'dotenv/config'
import { pool } from './db.js'

const PDS_HOSTNAME = process.env.PDS_HOSTNAME ?? 'pds.poltr.info'
const COLLECTION = process.env.BACKFILL_COLLECTION ?? 'app.ch.poltr.vote.proposal'
const BATCH_SIZE = Number(process.env.BACKFILL_BATCH_SIZE ?? 100)
// Comma-separated list of repo DIDs to backfill (e.g. "did:plc:abc,did:plc:xyz")
// If unset, the function does nothing and returns processed 0.
const REPOS_CSV = process.env.BACKFILL_REPOS ?? ''

/**
 * Helper: perform safe DB query with provided client or pool.
 */
async function dbQuery(clientOrPool, text, params = []) {
  if (!clientOrPool) throw new Error('No DB client/pool provided')
  return clientOrPool.query(text, params)
}

/**
 * Upsert a proposal record into poltr_vote_proposal.
 * Uses the given client (transactional) or pool.
 */
export async function upsertProposalDb(clientOrPool, params) {
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



/**
 * Fetch records from the PDS listRecords endpoint for a repo+collection.
 * This uses the public XRPC endpoint at: https://{PDS_HOSTNAME}/xrpc/com.atproto.repo.listRecords
 *
 * Input:
 *  - repo: did string
 *  - collection: collection name
 *  - limit: number
 *  - cursor: optional cursor string to continue from
 *
 * Returns object: { records: Array, cursor: string|null }
 *
 * Note: API shapes for AT-protocol may vary between PDS implementations.
 *       This implementation is defensive and will try to locate records in common fields.
 */
async function fetchRepoRecords({ repo, collection = COLLECTION, limit = BATCH_SIZE, cursor = null }) {
  // build query params and ensure repo is encoded
  const params = new URLSearchParams({
    repo: String(repo),
    collection,
    limit: String(limit),
  })
  if (cursor) params.set('cursor', cursor)

  const url = `https://${PDS_HOSTNAME}/xrpc/com.atproto.repo.listRecords?${params.toString()}`

  // Use GET and do not send a body (server expects GET)
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`listRecords failed for repo=${repo} status=${res.status} ${txt}`)
  }

  const j = await res.json().catch(() => null)
  if (!j) return { records: [], cursor: null }

  const records = Array.isArray(j.records) ? j.records : []
  const nextCursor = j.cursor ?? j.cursors?.next ?? null

  return { records, cursor: nextCursor }
}

/**
 * Normalize a single record object returned by listRecords to an object with:
 * { uri, cid, did, rkey, record }
 */
function normalizeRecord(repo, rec) {
  // rec may be shaped as { uri, cid, value } or { uri, cid, record }
  const uri = rec.uri ?? rec.value?.uri ?? null
  const cid = rec.cid ?? rec.value?.cid ?? null
  // The actual record object is usually in rec.value or rec.record
  const record = rec.value ?? rec.record ?? rec
  // If uri is present, we can parse DID and rkey: at://{did}/{collection}/{rkey}
  let did = repo
  let rkey = null
  if (uri && typeof uri === 'string') {
    const m = uri.match(/^at:\/\/([^/]+)\/[^/]+\/(.+)$/)
    if (m) {
      did = m[1]
      rkey = m[2]
    }
  }
  return { uri: uri ?? null, cid: cid ?? null, did, rkey, record }
}

/**
 * Main exported function used by runBackfill.
 *
 * - cursor: string|null (cursor from previous run)
 * - opts: { client, metadata }
 *
 * Behavior:
 * - Iterates over configured repos (BACKFILL_REPOS). For each repo it calls listRecords with cursor.
 * - Processes up to BATCH_SIZE records per repo in this batch invocation.
 * - Returns { nextCursor, processed } where nextCursor is the latest cursor (string) or null.
 *
 * IMPORTANT:
 * - To backfill across many repos you should call runBackfill repeatedly; this function is intentionally batch-limited.
 * - Set `BACKFILL_REPOS` environment variable to a comma-separated list of DIDs to backfill.
 */
export async function processBatchExample(cursor, { client = null, metadata = {} } = {}) {
  const repos = REPOS_CSV.split(',').map((s) => s.trim()).filter(Boolean)
  if (repos.length === 0) {
    console.log('BACKFILL_REPOS not set — no repos configured for backfill. Set env BACKFILL_REPOS=did:plc:...,did:plc:...')
    return { nextCursor: null, processed: 0 }
  }

  let totalProcessed = 0
  let lastCursor = cursor ?? null

  for (const repo of repos) {
    try {
      const { records, cursor: next } = await fetchRepoRecords({ repo, collection: COLLECTION, limit: BATCH_SIZE, cursor: lastCursor })
      if (!records || records.length === 0) {
        // nothing to process for this repo at this cursor
        continue
      }

      for (const rec of records) {
        const nr = normalizeRecord(repo, rec)
        if (!nr.uri) continue

        try {
          // Use provided client if available (transactional) otherwise pool
          await upsertProposalDb(client ?? pool, {
            uri: nr.uri,
            cid: nr.cid,
            did: nr.did,
            rkey: nr.rkey,
            record: nr.record,
          })
          totalProcessed++
        } catch (err) {
          console.error('Error processing record', nr.uri, err)
        }
      }

      // update lastCursor only if the PDS returned a new cursor
      if (next) lastCursor = next

      // If we've processed a full batch, return so runBackfill can persist progress and we don't run forever
      if (totalProcessed >= BATCH_SIZE) {
        break
      }
    } catch (err) {
      console.error('Error fetching records for repo', repo, err)
      // On errors, stop this batch and return what we've done so far (caller can retry)
      break
    }
  }

  return { nextCursor: lastCursor, processed: totalProcessed }
}
