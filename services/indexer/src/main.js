import 'dotenv/config'
import process from 'node:process'
import { Firehose } from '@bluesky-social/sync'
import { IdResolver } from '@bluesky-social/identity'
import { closePool } from './db.js'
import Fastify from 'fastify'
import { getCursor, setCursor } from './indexer_cursor.js'
import { processBatchFirehose, runBackfill } from './backfill_handler.js'
import { FIREHOSE_SERVICE } from './service.js'
import { handleEvent } from './record_handler.js'

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

  
  // MAIN FIREHOSE SUBSCRIPTION
  const firehose = new Firehose({
    idResolver,
    service: FIREHOSE_SERVICE,
    handleEvent: async (r) => {
      await handleEvent(r).then(() => {
        console.log('Event handled successfully for seq', r.seq);
        setCursor('firehose:subscription', r.seq)
      })
    },
    onError: (err) => {
      console.error('Firehose error', err);
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
    // console.log('Received backfill request')
    const id = 'backfill:firehose-missed'
    const maxBatches = Number(req.query.maxBatches ?? 100)
    try {

      const current = await getCursor(id)
      if (current && current.metadata && current.metadata.finished) {
        console.log('Backfill already finished for', id)
        return reply.code(200).send({ ok: true, id, cursor: current.cursor, finished: true })
      }

      console.log("Starting backfill", { id, maxBatches })
      const newCursor = await runBackfill({
        id,
        processBatch: processBatchFirehose,
        maxBatches,
      })
      const after = await getCursor(id)
      console.log("Backfill completed", { id, newCursor })
      return reply.code(200).send({ ok: true, id, cursor: newCursor ?? (after && after.cursor) ?? null })
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
