import 'dotenv/config'
import { IdResolver } from '@bluesky-social/identity'
import { getCursor, setCursor } from './indexer_cursor.js'
import { handleEvent } from './record_handler.js'
import { FIREHOSE_SERVICE } from './service.js'
import { Firehose, MemoryRunner } from '@bluesky-social/sync'

const idResolver = new IdResolver()
const BACKFILL_IDLE_TIMEOUT_SEC = Number(process.env.BACKFILL_IDLE_TIMEOUT_SEC ?? 10)

/**
 * Single-pass backfill: creates one Firehose + MemoryRunner that replays
 * from the stored cursor until idle (no new events for BACKFILL_IDLE_TIMEOUT_SEC).
 *
 * Returns { id, cursor, processed, finished }
 */
export async function runBackfill({ id }) {
  const current = await getCursor(id)
  let cursor = current && current.cursor
  if (typeof cursor === 'string' && /^\d+$/.test(cursor)) cursor = Number(cursor)

  const runner = new MemoryRunner({
    startCursor: cursor ?? 0,
    setCursor: async (c) => {
      try {
        await setCursor(id, c)
      } catch (e) {
        console.error('Error persisting backfill cursor:', e)
      }
    },
  })

  return new Promise((resolve, reject) => {
    let processed = 0
    let lastSeq = cursor ?? null
    let finished = false
    let timeOfLastEvent = Date.now()

    const finish = async (err) => {
      if (finished) return
      finished = true

      try {
        if (firehose) await firehose.destroy()
      } catch (e) {
        console.error('Error destroying backfill firehose:', e)
      }

      try {
        if (runner && typeof runner.destroy === 'function') await runner.destroy()
      } catch (e) {
        console.error('Error destroying backfill runner:', e)
      }

      clearInterval(intervalId)

      if (err) return reject(err)

      // Mark backfill as finished
      try {
        await setCursor(id, lastSeq, { finished: true })
      } catch (e) {
        console.error('Error persisting final backfill cursor:', e)
      }

      return resolve({ id, cursor: lastSeq, processed, finished: true })
    }

    const firehose = new Firehose({
      idResolver,
      service: FIREHOSE_SERVICE,
      runner,
      handleEvent: async (evt) => {
        timeOfLastEvent = Date.now()
        await handleEvent(evt)
        processed += 1
        if (evt.seq != null) lastSeq = evt.seq
      },
      onError: async (err) => {
        await finish(err)
      },
    })

    firehose.start().catch((err) => { finish(err) })

    // Poll for idle: if no events received within the timeout, we're caught up
    const intervalId = setInterval(async () => {
      if (Date.now() - timeOfLastEvent > BACKFILL_IDLE_TIMEOUT_SEC * 1000) {
        console.log(`Backfill idle for ${BACKFILL_IDLE_TIMEOUT_SEC}s, finishing (processed=${processed})`)
        await finish()
      }
    }, BACKFILL_IDLE_TIMEOUT_SEC * 1000)
  })
}
