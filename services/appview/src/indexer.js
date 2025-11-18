import { Firehose } from '@bluesky-social/sync'
import { IdResolver } from '@bluesky-social/identity'
import { pool, closePool } from './db.js'


const PDS_HOST = process.env.PDS_HOSTNAME ?? 'pds.poltr.info'
// Determine base websocket service host (no /xrpc/... appended).
// If user supplied a full URL including /xrpc/com.atproto.sync.subscribeRepos, strip the path.
const RAW_FIREHOSE = process.env.FIREHOSE_URL
let FIREHOSE_SERVICE
if (RAW_FIREHOSE) {
  if (/\/xrpc\//.test(RAW_FIREHOSE)) {
    try {
      const u = new URL(RAW_FIREHOSE)
      FIREHOSE_SERVICE = `${u.protocol}//${u.host}`
    } catch {
      FIREHOSE_SERVICE = RAW_FIREHOSE.replace(/\/xrpc\/.*/, '')
    }
  } else {
    FIREHOSE_SERVICE = RAW_FIREHOSE
  }
} else {
  FIREHOSE_SERVICE = `wss://${PDS_HOST}`
}

console.log('Using firehose service base:', FIREHOSE_SERVICE)
const idResolver = new IdResolver()

async function upsertProposal(params) {
  const { uri, cid, did, rkey, record } = params

  // map record fields -> DB columns
  const title = record.title ?? null
  const description = record.description ?? null
  const voteDate = record.voteDate ? new Date(record.voteDate) : null
  const createdAt = record.createdAt ? new Date(record.createdAt) : new Date()

  await pool.query(
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

async function markDeleted(uri) {
  await pool.query(
    `UPDATE poltr_vote_proposal
     SET deleted = true, indexed_at = now()
     WHERE uri = $1`,
    [uri],
  )
}

async function main() {
  function extractStatusCode(err) {
    if (!err) return null
    if (err.status) return err.status
    const msg = err.message || ''
    const m = msg.match(/Unexpected server response: (\d{3})/)
    if (m) return Number(m[1])
    return null
  }
  const firehose = new Firehose({
    idResolver,
    service: FIREHOSE_SERVICE,
    handleEvent: async (evt) => {
      if (evt.$type === 'com.atproto.sync.subscribeRepos#commit') {
        const did = evt.did
        const commit = evt.commit

        for (const op of commit.ops ?? []) {
          if (op.collection !== 'app.ch.poltr.vote.proposal') continue

          const rkey = op.rkey
          const uri = `at://${did}/${op.collection}/${rkey}`

          if (op.action === 'delete') {
            await markDeleted(uri)
            continue
          }

          // for create/update, the decoded record is usually on op.record
          const record = op.record
          if (!record) continue

          await upsertProposal({
            uri,
            cid: op.cid,
            did,
            rkey,
            record,
          })
        }
      }
    },
    onError: (err) => {
      console.error('Firehose error', err)
    },
  })

  // try to start the firehose with retries for transient errors
  const maxRetries = Number(process.env.FIREHOSE_MAX_RETRIES ?? 5)
  let attempt = 0
  while (true) {
    try {
      attempt++
      console.log(`Starting firehose (attempt ${attempt}) -> ${FIREHOSE_SERVICE}`)
      await firehose.start()
      console.log('Firehose indexer running on', FIREHOSE_SERVICE)
      break
    } catch (err) {
      const cause = err && err.cause ? err.cause : err
      const status = extractStatusCode(cause)
      console.error(
        `Firehose start failed (attempt ${attempt})`,
        status ? `status=${status}` : '',
        cause || err,
      )

      // if status is 5xx, we should retry, otherwise fail fast
      if (status && Number(status) >= 500 && attempt < maxRetries) {
        const backoff = Math.min(30_000, 1000 * 2 ** attempt)
        console.log(`Retrying in ${backoff}ms...`)
        await new Promise((r) => setTimeout(r, backoff))
        continue
      }

      // non-retryable or max attempts reached
      throw err
    }
  }

  // graceful stop on signals
  const stop = async () => {
    console.log('Stopping firehose and closing DB pool')
      try {
        const stopper = (firehose)?.stop
        if (typeof stopper === 'function') {
          await stopper.call(firehose)
        }
      } catch (err) {
        console.error('Error stopping firehose', err)
      }
    try {
      await closePool()
    } catch (err) {
      console.error('Error closing pool', err)
    }
    process.exit(0)
  }

  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
