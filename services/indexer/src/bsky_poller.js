import process from 'node:process'
import { pool, upsertBskyThreadPost } from './db.js'

const BSKY_PUBLIC_API = 'https://public.api.bsky.app'
const POLL_ENABLED = (process.env.BSKY_POLL_ENABLED ?? 'false') === 'true'
const POLL_INTERVAL_MS = Number(process.env.BSKY_POLL_INTERVAL_MS ?? 600_000) // 10 min
const DELAY_BETWEEN_THREADS_MS = 2000

// Arguments older than this get polled less frequently
const FRESH_THRESHOLD_HOURS = 48
const STALE_POLL_EVERY_N = 6 // poll stale args every Nth cycle

let pollCycleCount = 0

// ---------------------------------------------------------------------------
// Bluesky API
// ---------------------------------------------------------------------------

/**
 * Fetch a single thread from the Bluesky public API.
 */
async function fetchThread(uri) {
  const url = `${BSKY_PUBLIC_API}/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=10`
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`getPostThread failed (${res.status}): ${body}`)
  }
  return res.json()
}

/**
 * Batch-fetch post metadata (up to 25 per call).
 * Returns a Map of uri -> { replyCount, likeCount, repostCount }.
 */
async function batchGetPosts(uris) {
  const result = new Map()
  if (uris.length === 0) return result

  // API accepts max 25 URIs per call
  for (let i = 0; i < uris.length; i += 25) {
    const batch = uris.slice(i, i + 25)
    const params = batch.map((u) => `uris=${encodeURIComponent(u)}`).join('&')
    const url = `${BSKY_PUBLIC_API}/xrpc/app.bsky.feed.getPosts?${params}`

    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const data = await res.json()
      for (const post of data.posts ?? []) {
        result.set(post.uri, {
          replyCount: post.replyCount ?? 0,
          likeCount: post.likeCount ?? 0,
          repostCount: post.repostCount ?? 0,
        })
      }
    } catch (err) {
      console.error(`batchGetPosts failed for batch at offset ${i}:`, err.message)
    }

    // Small delay between batch calls
    if (i + 25 < uris.length) {
      await new Promise((r) => setTimeout(r, 500))
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// DB
// ---------------------------------------------------------------------------

function extractRkey(uri) {
  return uri.split('/').pop()
}

/**
 * Get all cross-posted arguments with their known Bluesky reply count.
 */
async function getCrosspostedArguments() {
  const res = await pool.query(
    `SELECT uri, bsky_post_uri, ballot_rkey, bsky_reply_count, created_at
     FROM app_arguments
     WHERE bsky_post_uri IS NOT NULL AND NOT deleted
     ORDER BY created_at DESC`,
  )
  return res.rows
}

/**
 * Update the cached Bluesky reply count on an argument.
 */
async function updateArgumentBskyReplyCount(uri, replyCount) {
  await pool.query(
    `UPDATE app_arguments SET bsky_reply_count = $1 WHERE uri = $2`,
    [replyCount, uri],
  )
}

// ---------------------------------------------------------------------------
// Thread walking
// ---------------------------------------------------------------------------

/**
 * Recursively walk thread replies and upsert each into app_comments as extern.
 */
async function walkReplies(replies, ballotRkey, argumentUri, rootUri, parentUri) {
  if (!replies || !Array.isArray(replies)) return

  for (const reply of replies) {
    if (!reply || reply.$type === 'app.bsky.feed.defs#blockedPost' ||
        reply.$type === 'app.bsky.feed.defs#notFoundPost') {
      continue
    }

    const post = reply.post
    if (!post || !post.uri) continue

    try {
      await upsertBskyThreadPost({
        uri: post.uri,
        cid: post.cid,
        did: post.author?.did,
        rkey: extractRkey(post.uri),
        text: post.record?.text ?? null,
        ballotUri: null,
        ballotRkey,
        parentUri,
        argumentUri,
        bskyPostUri: post.uri,
        bskyPostCid: post.cid,
        handle: post.author?.handle ?? null,
        displayName: post.author?.displayName ?? null,
        likeCount: post.likeCount ?? 0,
        repostCount: post.repostCount ?? 0,
        replyCount: post.replyCount ?? 0,
        createdAt: post.record?.createdAt ?? post.indexedAt,
      })
    } catch (err) {
      console.error(`Failed to upsert thread post ${post.uri}:`, err.message)
    }

    if (reply.replies) {
      await walkReplies(reply.replies, ballotRkey, argumentUri, rootUri, post.uri)
    }
  }
}

/**
 * Poll a single argument's Bluesky thread and import replies.
 */
async function pollArgumentThread(arg) {
  const { uri: argumentUri, bsky_post_uri: bskyPostUri, ballot_rkey: ballotRkey } = arg

  const data = await fetchThread(bskyPostUri)
  const thread = data.thread

  if (!thread || thread.$type === 'app.bsky.feed.defs#blockedPost' ||
      thread.$type === 'app.bsky.feed.defs#notFoundPost') {
    return
  }

  if (thread.replies) {
    await walkReplies(thread.replies, ballotRkey, argumentUri, bskyPostUri, bskyPostUri)
  }
}

// ---------------------------------------------------------------------------
// Main poll cycle
// ---------------------------------------------------------------------------

/**
 * Poll cross-posted arguments for Bluesky thread replies.
 *
 * Optimizations:
 * - Batch-checks reply counts via getPosts (25 per call) before fetching threads
 * - Only fetches full thread if reply count changed since last poll
 * - Fresh arguments (<48h) are polled every cycle
 * - Stale arguments (>48h) are polled every Nth cycle
 */
async function pollCrosspostedArguments() {
  pollCycleCount++
  const isStaleRound = pollCycleCount % STALE_POLL_EVERY_N === 0

  const allArgs = await getCrosspostedArguments()
  if (allArgs.length === 0) return

  const freshCutoff = new Date(Date.now() - FRESH_THRESHOLD_HOURS * 60 * 60 * 1000)

  // Split into fresh and stale
  const fresh = allArgs.filter((a) => new Date(a.created_at) >= freshCutoff)
  const stale = allArgs.filter((a) => new Date(a.created_at) < freshCutoff)

  // This cycle: always poll fresh, poll stale only every Nth cycle
  const toPoll = isStaleRound ? allArgs : fresh

  if (toPoll.length === 0) return

  console.log(
    `Bsky poll cycle #${pollCycleCount}: ${fresh.length} fresh, ${stale.length} stale` +
    (isStaleRound ? ' (stale round — polling all)' : ' (polling fresh only)'),
  )

  // Batch-check current reply counts on Bluesky
  const bskyUris = toPoll.map((a) => a.bsky_post_uri)
  const postMeta = await batchGetPosts(bskyUris)

  // Only fetch full thread for arguments with new replies
  let polledCount = 0
  for (const arg of toPoll) {
    const meta = postMeta.get(arg.bsky_post_uri)
    if (!meta) continue

    const knownReplyCount = arg.bsky_reply_count ?? 0
    const currentReplyCount = meta.replyCount

    if (currentReplyCount <= knownReplyCount) continue

    // New replies detected — fetch full thread
    try {
      await pollArgumentThread(arg)
      await updateArgumentBskyReplyCount(arg.uri, currentReplyCount)
      polledCount++
    } catch (err) {
      console.error(`Poller error for argument ${arg.uri}:`, err.message)
    }

    await new Promise((r) => setTimeout(r, DELAY_BETWEEN_THREADS_MS))
  }

  if (polledCount > 0) {
    console.log(`Imported threads for ${polledCount} argument(s) with new replies`)
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Start the Bluesky thread poller.
 * Polls cross-posted arguments for external Bluesky replies and imports them.
 * Returns a cleanup function to stop the interval.
 */
export function startBskyPoller() {
  if (!POLL_ENABLED) {
    console.log('Bluesky poller disabled (BSKY_POLL_ENABLED != true)')
    return () => {}
  }

  console.log(`Bluesky poller enabled, interval=${POLL_INTERVAL_MS}ms`)

  pollCrosspostedArguments().catch((err) => {
    console.error('Initial poll failed:', err.message)
  })

  const intervalId = setInterval(() => {
    pollCrosspostedArguments().catch((err) => {
      console.error('Poll cycle failed:', err.message)
    })
  }, POLL_INTERVAL_MS)

  return () => {
    clearInterval(intervalId)
    console.log('Bluesky poller stopped')
  }
}
