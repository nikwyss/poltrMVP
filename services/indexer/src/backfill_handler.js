import 'dotenv/config'
import { IdResolver } from '@bluesky-social/identity'
import { getCursor, setCursor } from './indexer_cursor.js'
import { handleEvent } from './record_handler.js'
import { FIREHOSE_SERVICE } from './service.js'
import { Firehose, MemoryRunner } from '@bluesky-social/sync'

const idResolver = new IdResolver()
const BACKFILL_TIMEOUT_SEC = 3



/*
  runBackfill options:
    - id: string (cursor id)
    - processBatch: async (cursor) => ({ nextCursor: string|null, processed: number })
    - maxBatches?: number (default 100)
*/
export async function runBackfill({ id, processBatch, maxBatches = 100 }) {

  // Simple sequential run: read cursor, run batches, persist cursor after the run
  const current = await getCursor(id)
  let cursor = current && current.cursor
  if (typeof cursor === 'string' && /^\d+$/.test(cursor)) cursor = Number(cursor)
  const metadata = current && current.metadata
  for (let i = 0; i < maxBatches; i++) {
    const res = await processBatch(cursor, { metadata })
    if (!res || typeof res.processed !== 'number') {
      throw new Error('processBatch must return { nextCursor, processed }')
    }

    console.log(`DEBUG backfill Batch ${i}: processed=${res.processed}, nextCursor=${res.nextCursor}, prevCursor=${cursor}`)
    const prevCursor = cursor
    cursor = res.nextCursor

    // if nothing processed or nextCursor is null/unchanged, stop
    if (res.processed === 0 || !cursor || res.nextCursor === prevCursor) {
      console.log("DEBUG backfill no more records to process, stopping")
      break
    }
  }

  // persist final cursor
  try {
    await setCursor(id, cursor, metadata || {})
  } catch (e) {
    console.error('Error persisting cursor after runBackfill:', e)
  }

  return cursor
}


export async function processBatchFirehose(arg1) {
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

    const timeoutSec = BACKFILL_TIMEOUT_SEC
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




