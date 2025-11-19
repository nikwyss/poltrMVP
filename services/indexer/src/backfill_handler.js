import 'dotenv/config'
import { IdResolver } from '@bluesky-social/identity'
import { handleEvent } from './record_handler.js'
import { FIREHOSE_SERVICE } from './service.js'
import { setCursor } from './backfill_cursor.js'
import { Firehose, MemoryRunner } from '@bluesky-social/sync'


const BATCH_SIZE = Number(process.env.BACKFILL_BATCH_SIZE ?? 100)
const idResolver = new IdResolver()

export async function processBatchFirehose(arg1, arg2 = {}) {
  let opts = {}
  if (arg1 && typeof arg1 === 'object' && (arg1.service || arg1.handleEvent || arg1.collection)) {
    opts = { ...arg1 }
  } else {
    const cursor = arg1 ?? null
    opts = {
      service: FIREHOSE_SERVICE,
      cursor,
      handleEvent,
    }
  }

  const {
    service = FIREHOSE_SERVICE,
    cursor = null,
    handleEvent: handler,
  } = opts

  // start runner at requested cursor and persist its cursor via setCursor()
  const runner = new MemoryRunner({
    startCursor: cursor ?? 0,
    setCursor: async (c) => {
      console.debug("START Backfill runner with cursor of ", c);
      try {
        await setCursor('backfill:firehose-missed', c)
      } catch (e) {
        console.error('Error persisting cursor:', e);
      }
    },
  })

  return new Promise((resolve, reject) => {
    let processed = 0
    let lastSeq = cursor ?? null
    let finished = false
    let firehose = null
    let timeOfLastEvent = Date.now()

    const finish = async (err, isEnd = false) => {
      console.debug("Finishing backfill batch:", { err, processed, lastSeq, isEnd })
      if (finished) return
      finished = true

      // Stop the firehose first
      try {
        if (firehose && typeof firehose.stop === 'function') {
          await firehose.stop()
        }
      } catch (e) {
        console.error('Error stopping firehose during finish:', e)
      }

      // Attempt to fully destroy the firehose if API supports it
      try {
        if (firehose && typeof firehose.destroy === 'function') {
          await firehose.destroy()
        }
      } catch (e) {
        console.error('Error destroying firehose during finish:', e)
      }

      // Destroy the runner to clear queues and pause processing
      try {
        if (runner && typeof runner.destroy === 'function') {
          await runner.destroy()
        }
      } catch (e) {
        console.error('Error destroying runner during finish:', e)
      }

      if (err) return reject(err)

      // If we're finishing because the runner is idle (end reached), persist the cursor and mark finished.
      if (isEnd) {
        try {
          await setCursor('backfill:firehose-missed', lastSeq, { finished: true })
        } catch (e) {
          console.error('Error persisting final finished cursor:', e)
        }
      }

      return resolve({ nextCursor: lastSeq, processed })
    }

    firehose = new Firehose({
      idResolver,
      service,
      runner,
      cursor: cursor != null ? cursor : undefined,
      params: cursor != null ? { cursor } : undefined,

      // params: cursor != null ? { cursor: cursor } : undefined,
      handleEvent: async (evt) => {
        console.debug('---HandleEvent received event:', evt.seq);
        timeOfLastEvent = Date.now()
        await handler(evt)
        processed += 1
        if (evt.seq != null) lastSeq = evt.seq
      },
      onError: async (err) => {
        await finish(err)
      },
    })

    // start the firehose and catch startup errors
    firehose.start().catch((err) => { finish(err) })

    const timeoutSec = process.env.BACKFILL_TIMEOUT_SEC ? Number(process.env.BACKFILL_TIMEOUT_SEC) : 3
    const intervalId = setInterval(async () => {
      // DEFAULT FINISH CALL
      if (Date.now() - timeOfLastEvent > timeoutSec * 1000) {
        clearInterval(intervalId)
        console.debug("Backfill timeout idle time reached, finishing batch");
        await finish()
      }
    }, timeoutSec * 1000); // safety timeout
  })
}




