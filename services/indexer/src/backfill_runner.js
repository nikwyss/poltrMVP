import { getCursor, setCursor } from './backfill_cursor.js'


/*
  runBackfill options:
    - id: string (cursor id)
    - processBatch: async (cursor) => ({ nextCursor: string|null, processed: number })
    - maxBatches?: number (default 100)
*/
export async function runBackfill({ id, processBatch, maxBatches = 100 }) {
  let totalProcessed = 0


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

    totalProcessed += res.processed
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