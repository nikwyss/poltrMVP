import 'dotenv/config'
import { Firehose } from '@bluesky-social/sync'
import { IdResolver } from '@bluesky-social/identity'
import { pool, closePool } from './db.js'
import Fastify from 'fastify'
import { runBackfill } from './backfill_runner.js'
import { getCursor } from './backfill_cursor.js'
import { processBatchExample } from './backfill_handler.js'
import { upsertProposalDb, markDeleted } from './backfill_handler.js'

const PDS_HOSTNAME = process.env.PDS_HOSTNAME ?? 'pds.poltr.info'
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

          await upsertProposalDb(pool, {
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



// Add HTTP admin trigger and optional schedule
async function startAdminServer() {
  const port = Number(process.env.BACKFILL_PORT ?? 3001)
  const app = Fastify({ logger: false })

  const backfillHandler = async (req, reply) => {
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
  }

  app.post('/backfill', backfillHandler)
  app.get('/backfill', backfillHandler)

  await app.listen({ port, host: '0.0.0.0' })
  console.log('Admin HTTP server listening on port', port)
}


// In your main startup, after starting the firehose, call:
startAdminServer().catch((err) => {
  console.error('Admin server failed to start', err)
})
