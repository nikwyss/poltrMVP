import process from 'node:process'
import { getActiveBallots, getArgumentUrisForBallot, updateBallotBskyCounts, upsertBskyThreadPost } from './db.js'

const BSKY_PUBLIC_API = 'https://public.api.bsky.app'
const POLL_ENABLED = (process.env.BSKY_POLL_ENABLED ?? 'false') === 'true'
const POLL_INTERVAL_MS = Number(process.env.BSKY_POLL_INTERVAL_MS ?? 600_000) // 10 min
const DELAY_BETWEEN_BALLOTS_MS = 2000

/**
 * Fetch a thread from the Bluesky public API.
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
 * Extract ballot rkey from a ballot AT-URI.
 * e.g. "at://did:plc:xxx/app.ch.poltr.ballot.entry/682.3" -> "682.3"
 */
function extractRkey(uri) {
  return uri.split('/').pop()
}

/**
 * Recursively walk thread replies and upsert each into app_comments.
 * @param {Array} replies - Thread reply nodes
 * @param {string} ballotUri - The poltr ballot AT-URI
 * @param {string} ballotRkey - The ballot record key
 * @param {string} rootUri - The root Bluesky post URI
 * @param {Set<string>} knownArgumentUris - Set of Bluesky URIs that are cross-posted arguments
 * @param {string|null} argumentUri - Inherited argument URI from ancestor (propagated down)
 */
async function walkReplies(replies, ballotUri, ballotRkey, rootUri, knownArgumentUris, argumentUri) {
  if (!replies || !Array.isArray(replies)) return

  for (const reply of replies) {
    if (!reply || reply.$type === 'app.bsky.feed.defs#blockedPost' ||
        reply.$type === 'app.bsky.feed.defs#notFoundPost') {
      continue
    }

    const post = reply.post
    if (!post || !post.uri) continue

    // If this post is a known argument, it becomes the argumentUri for all descendants
    const currentArgumentUri = knownArgumentUris.has(post.uri) ? post.uri : argumentUri

    try {
      await upsertBskyThreadPost({
        uri: post.uri,
        cid: post.cid,
        did: post.author?.did,
        rkey: extractRkey(post.uri),
        text: post.record?.text ?? null,
        ballotUri,
        ballotRkey,
        parentUri: post.record?.reply?.parent?.uri ?? rootUri,
        argumentUri: currentArgumentUri,
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

    // Recurse into nested replies, propagating argumentUri
    if (reply.replies) {
      await walkReplies(reply.replies, ballotUri, ballotRkey, rootUri, knownArgumentUris, currentArgumentUri)
    }
  }
}

/**
 * Poll a single ballot's Bluesky thread and import replies + counts.
 */
async function pollBallotThread(ballot) {
  const { uri: ballotUri, bsky_post_uri: bskyPostUri } = ballot
  const ballotRkey = extractRkey(ballotUri)

  const data = await fetchThread(bskyPostUri)
  const thread = data.thread

  if (!thread || thread.$type === 'app.bsky.feed.defs#blockedPost' ||
      thread.$type === 'app.bsky.feed.defs#notFoundPost') {
    console.warn(`Thread not available for ballot ${ballotUri}`)
    return
  }

  // Update ballot engagement counts from the root post
  const rootPost = thread.post
  if (rootPost) {
    await updateBallotBskyCounts(ballotUri, {
      likeCount: rootPost.likeCount ?? 0,
      repostCount: rootPost.repostCount ?? 0,
      replyCount: rootPost.replyCount ?? 0,
    })
  }

  // Build set of known argument URIs for this ballot
  const argumentRows = await getArgumentUrisForBallot(ballotUri)
  const knownArgumentUris = new Set(argumentRows.map((r) => r.bsky_post_uri))

  // Walk and import all replies, tagging each with its ancestor argument
  if (thread.replies) {
    await walkReplies(thread.replies, ballotUri, ballotRkey, bskyPostUri, knownArgumentUris, null)
  }
}

/**
 * Poll all active ballots.
 */
async function pollActiveBallots() {
  const ballots = await getActiveBallots()
  if (ballots.length === 0) return

  console.log(`Polling ${ballots.length} active ballot(s) for Bluesky threads`)

  for (let i = 0; i < ballots.length; i++) {
    try {
      await pollBallotThread(ballots[i])
    } catch (err) {
      console.error(`Poller error for ballot ${ballots[i].uri}:`, err.message)
    }

    // Delay between requests to avoid hammering the API
    if (i < ballots.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_BALLOTS_MS))
    }
  }
}

/**
 * Start the Bluesky thread poller.
 * Returns a cleanup function to stop the interval.
 */
export function startBskyPoller() {
  if (!POLL_ENABLED) {
    console.log('Bluesky poller disabled (BSKY_POLL_ENABLED != true)')
    return () => {}
  }

  console.log(`Bluesky poller enabled, interval=${POLL_INTERVAL_MS}ms`)

  // Run once immediately, then on interval
  pollActiveBallots().catch((err) => {
    console.error('Initial poll failed:', err.message)
  })

  const intervalId = setInterval(() => {
    pollActiveBallots().catch((err) => {
      console.error('Poll cycle failed:', err.message)
    })
  }, POLL_INTERVAL_MS)

  return () => {
    clearInterval(intervalId)
    console.log('Bluesky poller stopped')
  }
}
