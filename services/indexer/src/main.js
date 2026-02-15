import 'dotenv/config'
import process from 'node:process'
import { Firehose, MemoryRunner } from '@bluesky-social/sync'
import { IdResolver } from '@bluesky-social/identity'
import { closePool } from './db.js'
import Fastify from 'fastify'
import { getCursor, setCursor } from './indexer_cursor.js'
import { runBackfill } from './backfill_handler.js'
import { FIREHOSE_SERVICE } from './service.js'
import { handleEvent } from './record_handler.js'

const idResolver = new IdResolver()

const firehoseEnabled = (process.env.FIREHOSE_ENABLED ?? 'true') !== 'false'
let firehoseRunning = false

async function main() {
  if (!firehoseEnabled) {
    console.log('Firehose disabled via FIREHOSE_ENABLED=false')
    return
  }

  function extractStatusCode(err) {
    if (!err) return null
    if (err.status) return err.status
    const msg = err.message || ''
    const m = msg.match(/Unexpected server response: (\d{3})/)
    if (m) return Number(m[1])
    return null
  }

  // Load initial cursor for MemoryRunner
  const row = await getCursor('firehose:subscription')
  const startCursor = row.cursor != null ? Number(row.cursor) : undefined

  const runner = new MemoryRunner({
    startCursor,
    setCursor: async (cursor) => {
      await setCursor('firehose:subscription', cursor)
    },
  })

  // MAIN FIREHOSE SUBSCRIPTION
  const firehose = new Firehose({
    idResolver,
    service: FIREHOSE_SERVICE,
    runner,
    handleEvent: async (evt) => {
      await handleEvent(evt)
    },
    onError: (err) => {
      console.error('Firehose error:', err)
    },
  })

  // try to start the firehose with retries for transient errors
  const maxRetries = Number(process.env.FIREHOSE_MAX_RETRIES ?? 5)
  let attempt = 0
  while (true) {
    try {
      attempt++
      console.log(`Starting firehose (attempt ${attempt}) -> ${FIREHOSE_SERVICE}`)
      firehoseRunning = true
      await firehose.start()
      // start() only resolves when the firehose stops
      firehoseRunning = false
      console.log('Firehose stopped')
      break
    } catch (err) {
      firehoseRunning = false
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
    firehoseRunning = false
    try {
      await firehose.destroy()
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
    const id = 'backfill:firehose-missed'
    try {
      const current = await getCursor(id)
      if (current && current.metadata && current.metadata.finished) {
        console.log('Backfill already finished for', id)
        return reply.code(200).send({ ok: true, id, cursor: current.cursor, finished: true })
      }

      console.log('Starting backfill', { id })
      const result = await runBackfill({ id })
      console.log('Backfill completed', { id, cursor: result.cursor, processed: result.processed })
      return reply.code(200).send({ ok: true, ...result })
    } catch (err) {
      console.error('Backfill error', err)
      return reply.code(500).send({ ok: false, error: String(err) })
    }
  }

  app.post('/backfill', backfillHandler)
  app.get('/backfill', backfillHandler)

  app.get('/health', async (_req, reply) => {
    const cursor = await getCursor('firehose:subscription')
    return reply.code(200).send({
      ok: true,
      firehoseEnabled,
      firehose: firehoseRunning ? 'connected' : 'disconnected',
      cursor: cursor.cursor ?? null,
    })
  })

  await app.listen({ port, host: '0.0.0.0' })
  console.log('Admin HTTP server listening on port', port)
}


// In your main startup, after starting the firehose, call:
startAdminServer().catch((err) => {
  console.error('Admin server failed to start', err)
})
