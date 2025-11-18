import { withCursorLock } from './backfill_cursor.js'

/*
  runBackfill options:
    - id: string (cursor id)
    - processBatch: async (cursor) => ({ nextCursor: string|null, processed: number })
    - maxBatches?: number (default 100)
*/
export async function runBackfill({ id, processBatch, maxBatches = 100 }) {
  let totalProcessed = 0
  // Use a lock per run to prevent concurrent runs
  return withCursorLock(id, async (currentCursor, metadata, client) => {
    let cursor = currentCursor
    for (let i = 0; i < maxBatches; i++) {
      const res = await processBatch(cursor, { client, metadata })
      if (!res || typeof res.processed !== 'number') {
        throw new Error('processBatch must return { nextCursor, processed }')
      }

      totalProcessed += res.processed
      cursor = res.nextCursor

      // if nothing processed or nextCursor is null/unchanged, stop
      if (res.processed === 0 || !cursor) {
        break
      }
    }

    return cursor
  })
}