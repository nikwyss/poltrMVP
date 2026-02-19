import "dotenv/config";
import { Pool } from "pg";
import process from "node:process";

export const pool = new Pool({
  connectionString: process.env.INDEXER_POSTGRES_URL,
});

export async function closePool() {
  await pool.end();
}

/**
 * Helper: perform safe DB query with provided client or pool.
 */
export async function dbQuery(clientOrPool, text, params = []) {
  if (!clientOrPool) throw new Error("No DB client/pool provided");
  return clientOrPool.query(text, params);
}

/**
 * Upsert a ballot record into app_ballots.
 * Uses the given client (transactional) or pool.
 */
export async function upsertBallotDb(clientOrPool, params) {
  const { uri, cid, did, rkey, record } = params;

  const title = record.title ?? null;
  const description = record.description ?? null;
  const voteDate = record.voteDate ? new Date(record.voteDate) : null;
  const createdAt = record.createdAt ? new Date(record.createdAt) : new Date();

  await dbQuery(
    clientOrPool,
    `
    INSERT INTO app_ballots
      (uri, cid, did, rkey, title, description, vote_date, created_at, deleted)
    VALUES
      ($1,  $2,  $3,  $4,  $5,    $6,          $7,        $8,        false)
    ON CONFLICT (uri) DO UPDATE SET
      cid         = EXCLUDED.cid,
      title       = EXCLUDED.title,
      description = EXCLUDED.description,
      vote_date   = EXCLUDED.vote_date,
      created_at  = EXCLUDED.created_at,
      deleted     = false,
      indexed_at  = now()
    `,
    [uri, cid, did, rkey, title, description, voteDate, createdAt],
  );
}

export async function markDeleted(uri) {
  await pool.query(
    `UPDATE app_ballots
     SET deleted = true, indexed_at = now()
     WHERE uri = $1`,
    [uri],
  );
}

/**
 * Upsert a like record into app_likes.
 */
export async function upsertLikeDb(clientOrPool, params) {
  const { uri, cid, did, rkey, record } = params;

  const subjectUri = record?.subject?.uri ?? null;
  const subjectCid = record?.subject?.cid ?? null;
  const preference = record?.preference ?? null;
  const createdAt = record?.createdAt ? new Date(record.createdAt) : new Date();

  await dbQuery(
    clientOrPool,
    `
    INSERT INTO app_likes
      (uri, cid, did, rkey, subject_uri, subject_cid, preference, created_at, deleted)
    VALUES
      ($1,  $2,  $3,  $4,  $5,          $6,          $7,         $8,         false)
    ON CONFLICT (uri) DO UPDATE SET
      cid         = EXCLUDED.cid,
      subject_uri = EXCLUDED.subject_uri,
      subject_cid = EXCLUDED.subject_cid,
      preference  = EXCLUDED.preference,
      created_at  = EXCLUDED.created_at,
      deleted     = false,
      indexed_at  = now()
    `,
    [uri, cid, did, rkey, subjectUri, subjectCid, preference, createdAt],
  );

  if (subjectUri) {
    await refreshLikeCount(clientOrPool, subjectUri);
  }
}

/**
 * Soft-delete a like and refresh the parent ballot's like_count.
 */
export async function markLikeDeleted(uri) {
  const res = await pool.query(
    `UPDATE app_likes
     SET deleted = true, indexed_at = now()
     WHERE uri = $1
     RETURNING subject_uri`,
    [uri],
  );

  const subjectUri = res.rows?.[0]?.subject_uri;
  if (subjectUri) {
    await refreshLikeCount(pool, subjectUri);
  }
}

/**
 * Recount non-deleted likes and update app_ballots.like_count.
 */
/**
 * Upsert a pseudonym profile into app_profiles.
 */
export async function upsertProfileDb(clientOrPool, params) {
  const { did, record } = params;

  const displayName = record.displayName ?? null;
  const mountainName = record.mountainName ?? null;
  const mountainFullname = record.mountainFullname ?? null;
  const canton = record.canton ?? null;
  const height = record.height ?? null;
  const color = record.color ?? null;
  const createdAt = record.createdAt ? new Date(record.createdAt) : null;

  await dbQuery(
    clientOrPool,
    `
    INSERT INTO app_profiles
      (did, display_name, mountain_name, mountain_fullname, canton, height, color, created_at)
    VALUES
      ($1,  $2,           $3,            $4,                $5,     $6,     $7,    $8)
    ON CONFLICT (did) DO UPDATE SET
      display_name      = EXCLUDED.display_name,
      mountain_name     = EXCLUDED.mountain_name,
      mountain_fullname = EXCLUDED.mountain_fullname,
      canton            = EXCLUDED.canton,
      height            = EXCLUDED.height,
      color             = EXCLUDED.color,
      created_at        = EXCLUDED.created_at,
      indexed_at        = now()
    `,
    [did, displayName, mountainName, mountainFullname, canton, height, color, createdAt],
  );
}

/**
 * Delete a profile from app_profiles.
 */
export async function deleteProfile(did) {
  await pool.query(
    `DELETE FROM app_profiles WHERE did = $1`,
    [did],
  );
}

/**
 * Check if a ballot already has a cross-posted bsky post.
 */
export async function getBskyPostUri(uri) {
  const res = await pool.query(
    `SELECT bsky_post_uri FROM app_ballots WHERE uri = $1`,
    [uri],
  );
  return res.rows?.[0]?.bsky_post_uri ?? null;
}

/**
 * Store the cross-posted bsky post URI and CID on the ballot.
 */
export async function setBskyPostUri(ballotUri, bskyPostUri, bskyPostCid) {
  await pool.query(
    `UPDATE app_ballots SET bsky_post_uri = $1, bsky_post_cid = $2 WHERE uri = $3`,
    [bskyPostUri, bskyPostCid ?? null, ballotUri],
  );
}

/**
 * Get the bsky cross-post URI for an argument.
 */
export async function getArgumentBskyPostUri(uri) {
  const res = await pool.query(
    `SELECT bsky_post_uri FROM app_arguments WHERE uri = $1`,
    [uri],
  );
  return res.rows?.[0]?.bsky_post_uri ?? null;
}

/**
 * Store the cross-posted bsky post URI and CID on an argument.
 */
export async function setArgumentBskyPostUri(argumentUri, bskyPostUri, bskyPostCid) {
  await pool.query(
    `UPDATE app_arguments SET bsky_post_uri = $1, bsky_post_cid = $2 WHERE uri = $3`,
    [bskyPostUri, bskyPostCid ?? null, argumentUri],
  );
}

/**
 * Store the cross-posted Bluesky like URI on the like record.
 */
export async function setBskyLikeUri(likeUri, bskyLikeUri) {
  await pool.query(
    `UPDATE app_likes SET bsky_like_uri = $1 WHERE uri = $2`,
    [bskyLikeUri, likeUri],
  );
}

/**
 * Get the stored encrypted PDS credentials for a user.
 */
export async function getUserPdsCreds(did) {
  const res = await pool.query(
    `SELECT app_pw_ciphertext, app_pw_nonce FROM auth.auth_creds WHERE did = $1`,
    [did],
  );
  const row = res.rows?.[0];
  if (!row) return null;
  return { ciphertext: row.app_pw_ciphertext, nonce: row.app_pw_nonce };
}

/**
 * Get the cross-posted Bluesky post URI and CID for a ballot.
 */
export async function getBskyPostForBallot(subjectUri) {
  const res = await pool.query(
    `SELECT bsky_post_uri, bsky_post_cid FROM app_ballots WHERE uri = $1`,
    [subjectUri],
  );
  const row = res.rows?.[0];
  if (!row || !row.bsky_post_uri || !row.bsky_post_cid) return null;
  return { bsky_post_uri: row.bsky_post_uri, bsky_post_cid: row.bsky_post_cid };
}

/**
 * Get all active ballots that have a Bluesky cross-post.
 */
export async function getActiveBallots() {
  const res = await pool.query(
    `SELECT uri, bsky_post_uri
     FROM app_ballots
     WHERE active = 1
       AND bsky_post_uri IS NOT NULL
       AND NOT deleted`,
  );
  return res.rows;
}

/**
 * Get cross-posted Bluesky URIs for arguments belonging to a ballot.
 * Returns rows with { bsky_post_uri }.
 */
export async function getArgumentUrisForBallot(ballotUri) {
  const res = await pool.query(
    `SELECT bsky_post_uri FROM app_arguments
     WHERE ballot_uri = $1 AND bsky_post_uri IS NOT NULL AND NOT deleted`,
    [ballotUri],
  );
  return res.rows;
}

/**
 * Upsert an argument record into app_arguments.
 */
export async function upsertArgumentDb(clientOrPool, params) {
  const { uri, cid, did, rkey, record } = params;

  const title = record.title ?? null;
  const body = record.body ?? null;
  const type = record.type ?? null;
  const ballotUri = record.ballot ?? null;
  const ballotRkey = ballotUri ? ballotUri.split("/").pop() : null;
  const createdAt = record.createdAt ? new Date(record.createdAt) : new Date();

  await dbQuery(
    clientOrPool,
    `
    INSERT INTO app_arguments
      (uri, cid, did, rkey, title, body, type, ballot_uri, ballot_rkey, created_at, deleted)
    VALUES
      ($1,  $2,  $3,  $4,  $5,    $6,   $7,   $8,         $9,          $10,       false)
    ON CONFLICT (uri) DO UPDATE SET
      cid         = EXCLUDED.cid,
      title       = EXCLUDED.title,
      body        = EXCLUDED.body,
      type        = EXCLUDED.type,
      ballot_uri  = EXCLUDED.ballot_uri,
      ballot_rkey = EXCLUDED.ballot_rkey,
      created_at  = EXCLUDED.created_at,
      deleted     = false,
      indexed_at  = now()
    `,
    [uri, cid, did, rkey, title, body, type, ballotUri, ballotRkey, createdAt],
  );
}

/**
 * Soft-delete an argument. Returns the bsky_post_uri if one exists.
 */
export async function markArgumentDeleted(uri) {
  const res = await pool.query(
    `UPDATE app_arguments
     SET deleted = true, indexed_at = now()
     WHERE uri = $1
     RETURNING bsky_post_uri`,
    [uri],
  );
  return res.rows?.[0]?.bsky_post_uri ?? null;
}

/**
 * Update Bluesky engagement counts on a ballot.
 */
export async function updateBallotBskyCounts(ballotUri, { likeCount, repostCount, replyCount }) {
  await pool.query(
    `UPDATE app_ballots
     SET bsky_like_count   = $1,
         bsky_repost_count = $2,
         bsky_reply_count  = $3,
         indexed_at        = now()
     WHERE uri = $4`,
    [likeCount ?? 0, repostCount ?? 0, replyCount ?? 0, ballotUri],
  );
}

/**
 * Upsert a Bluesky thread post into app_comments (origin = 'extern').
 * On conflict, updates engagement counts but preserves text.
 */
export async function upsertBskyThreadPost(params) {
  const {
    uri, cid, did, rkey, text, ballotUri, ballotRkey,
    parentUri, argumentUri, bskyPostUri, bskyPostCid,
    handle, displayName, likeCount, repostCount, replyCount, createdAt,
  } = params;

  await pool.query(
    `INSERT INTO app_comments
       (uri, cid, did, rkey, origin, text, ballot_uri, ballot_rkey,
        parent_uri, argument_uri, bsky_post_uri, bsky_post_cid,
        handle, display_name,
        bsky_like_count, bsky_repost_count, bsky_reply_count,
        created_at, deleted)
     VALUES
       ($1, $2, $3, $4, 'extern', $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13,
        $14, $15, $16,
        $17, false)
     ON CONFLICT (uri) DO UPDATE SET
       cid               = EXCLUDED.cid,
       argument_uri      = COALESCE(EXCLUDED.argument_uri, app_comments.argument_uri),
       handle            = EXCLUDED.handle,
       display_name      = EXCLUDED.display_name,
       bsky_like_count   = EXCLUDED.bsky_like_count,
       bsky_repost_count = EXCLUDED.bsky_repost_count,
       bsky_reply_count  = EXCLUDED.bsky_reply_count,
       indexed_at        = now()`,
    [
      uri, cid, did, rkey, text, ballotUri, ballotRkey,
      parentUri, argumentUri ?? null, bskyPostUri, bskyPostCid,
      handle, displayName,
      likeCount ?? 0, repostCount ?? 0, replyCount ?? 0,
      createdAt ? new Date(createdAt) : new Date(),
    ],
  );
}

export async function refreshLikeCount(clientOrPool, subjectUri) {
  await dbQuery(
    clientOrPool,
    `
    UPDATE app_ballots
    SET like_count = (
      SELECT count(*) FROM app_likes
      WHERE subject_uri = $1 AND NOT deleted
    )
    WHERE uri = $1
    `,
    [subjectUri],
  );
}
