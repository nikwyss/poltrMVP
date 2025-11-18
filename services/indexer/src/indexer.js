import { Firehose } from '@bluesky-social/sync'
import { IdResolver } from '@bluesky-social/identity'
import { pool, closePool } from './db.js'
import Fastify from 'fastify'
import { runBackfill } from './backfill_runner.js'
import { getCursor } from './backfill_cursor.js'

const PDS_HOSTNAME = process.env.PDS_HOSTNAMENAME ?? 'pds.poltr.info'
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
  FIREHOSE_SERVICE = `wss://${PDS_HOSTNAME}`
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




// keep existing code...

// Minimal processBatch implementation (replace with real backfill logic):
// Should fetch missed records starting from `cursor`, insert/process them,
// and return { nextCursor, processed }.
async function processBatchExample(cursor, { client, metadata }) {
  // TODO: replace with actual logic to fetch records from PDS between cursor and latest
  // This example simply logs and returns processed=0 to indicate done.
  console.log('processBatchExample called with cursor:', cursor)
  // If there were records processed, return new cursor and processed count
  return { nextCursor: null, processed: 0 }
}

// Add HTTP admin trigger and optional schedule
async function startAdminServer() {
  const port = Number(process.env.BACKFILL_PORT ?? 3001)
  const app = Fastify({ logger: false })

  app.post('/backfill', async (req, reply) => {
    const id = req.query.id || 'backfill:firehose-missed'
    const maxBatches = Number(req.query.maxBatches ?? 100)
    try {
      const newCursor = await runBackfill({
        id,
        processBatch: processBatchExample,
        maxBatches,
      })
      const current = await getCursor(id)
      return reply.code(200).send({ ok: true, id, cursor: newCursor ?? (current && current.cursor) ?? null })
    } catch (err) {
      console.error('Backfill error', err)
      return reply.code(500).send({ ok: false, error: String(err) })
    }
  })

  await app.listen({ port, host: '0.0.0.0' })
  console.log('Admin HTTP server listening on port', port)
}

// Optional in-process nightly schedule (local time midnight)
// If you prefer a K8s CronJob, skip setting SCHEDULE_NIGHTLY.
// function scheduleNightlyTrigger() {
//   if (!process.env.SCHEDULE_NIGHTLY || process.env.SCHEDULE_NIGHTLY === 'false') return

//   const msPerDay = 24 * 60 * 60 * 1000
//   function msUntilNextMidnight() {
//     const now = new Date()
//     const next = new Date(now)
//     next.setDate(now.getDate() + 1)
//     next.setHours(0, 0, 0, 0)
//     return next - now
//   }

//   async function run() {
//     try {
//       console.log('Nightly backfill scheduled run starting...')
//       await runBackfill({
//         id: 'backfill:firehose-missed',
//         processBatch: processBatchExample,
//         maxBatches: Number(process.env.BACKFILL_NIGHTLY_MAX_BATCHES ?? 500),
//       })
//       console.log('Nightly backfill run completed')
//     } catch (err) {
//       console.error('Nightly backfill failed', err)
//     } finally {
//       // schedule next run in 24 hours
//       setTimeout(run, msPerDay)
//     }
//   }

//   // wait until next midnight then start
//   setTimeout(run, msUntilNextMidnight())
// }

// In your main startup, after starting the firehose, call:
startAdminServer().catch((err) => {
  console.error('Admin server failed to start', err)
})

// scheduleNightlyTrigger()