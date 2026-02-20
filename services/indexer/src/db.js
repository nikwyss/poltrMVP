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
  const originalUri = record.originalUri ?? null;
  // Governance copies (have originalUri) are approved; user-submitted are preliminary
  const reviewStatus = originalUri ? "approved" : "preliminary";

  await dbQuery(
    clientOrPool,
    `
    INSERT INTO app_arguments
      (uri, cid, did, rkey, title, body, type, ballot_uri, ballot_rkey,
       review_status, original_uri, created_at, deleted)
    VALUES
      ($1,  $2,  $3,  $4,  $5,    $6,   $7,   $8,         $9,
       $10, $11, $12, false)
    ON CONFLICT (uri) DO UPDATE SET
      cid           = EXCLUDED.cid,
      title         = EXCLUDED.title,
      body          = EXCLUDED.body,
      type          = EXCLUDED.type,
      ballot_uri    = EXCLUDED.ballot_uri,
      ballot_rkey   = EXCLUDED.ballot_rkey,
      review_status = EXCLUDED.review_status,
      original_uri  = EXCLUDED.original_uri,
      created_at    = EXCLUDED.created_at,
      deleted       = false,
      indexed_at    = now()
    `,
    [uri, cid, did, rkey, title, body, type, ballotUri, ballotRkey,
     reviewStatus, originalUri, createdAt],
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

/**
 * Upsert a comment record into app_comments (origin = 'intern').
 */
export async function upsertCommentDb(clientOrPool, params) {
  const { uri, cid, did, rkey, record } = params;

  const title = record.title ?? null;
  const body = record.body ?? null;
  const argumentUri = record.argument ?? null;
  const argumentRkey = argumentUri ? argumentUri.split("/").pop() : null;
  const createdAt = record.createdAt ? new Date(record.createdAt) : new Date();

  // Derive ballot info from the argument
  let ballotUri = null;
  let ballotRkey = null;
  if (argumentUri) {
    const res = await dbQuery(
      clientOrPool,
      `SELECT ballot_uri, ballot_rkey FROM app_arguments WHERE uri = $1 AND NOT deleted`,
      [argumentUri],
    );
    if (res.rows.length > 0) {
      ballotUri = res.rows[0].ballot_uri;
      ballotRkey = res.rows[0].ballot_rkey;
    }
  }

  await dbQuery(
    clientOrPool,
    `
    INSERT INTO app_comments
      (uri, cid, did, rkey, origin, title, text, ballot_uri, ballot_rkey,
       argument_uri, created_at, deleted)
    VALUES
      ($1,  $2,  $3,  $4,  'intern', $5,  $6,  $7,         $8,
       $9,  $10, false)
    ON CONFLICT (uri) DO UPDATE SET
      cid          = EXCLUDED.cid,
      title        = EXCLUDED.title,
      text         = EXCLUDED.text,
      ballot_uri   = EXCLUDED.ballot_uri,
      ballot_rkey  = EXCLUDED.ballot_rkey,
      argument_uri = EXCLUDED.argument_uri,
      created_at   = EXCLUDED.created_at,
      deleted      = false,
      indexed_at   = now()
    `,
    [uri, cid, did, rkey, title, body, ballotUri, ballotRkey, argumentUri, createdAt],
  );
}

/**
 * Soft-delete a comment.
 */
export async function markCommentDeleted(uri) {
  await pool.query(
    `UPDATE app_comments
     SET deleted = true, indexed_at = now()
     WHERE uri = $1`,
    [uri],
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

/**
 * Upsert a review invitation into app_review_invitations.
 */
export async function upsertReviewInvitationDb(clientOrPool, params) {
  const { uri, cid, did, rkey, record } = params;

  const argumentUri = record.argument ?? null;
  const inviteeDid = record.invitee ?? null;
  const createdAt = record.createdAt ? new Date(record.createdAt) : new Date();

  await dbQuery(
    clientOrPool,
    `
    INSERT INTO app_review_invitations
      (uri, cid, argument_uri, invitee_did, created_at, deleted)
    VALUES
      ($1,  $2,  $3,           $4,          $5,         false)
    ON CONFLICT (uri) DO UPDATE SET
      cid          = EXCLUDED.cid,
      argument_uri = EXCLUDED.argument_uri,
      invitee_did  = EXCLUDED.invitee_did,
      created_at   = EXCLUDED.created_at,
      deleted      = false,
      indexed_at   = now()
    `,
    [uri, cid, argumentUri, inviteeDid, createdAt],
  );
}

/**
 * Soft-delete a review invitation.
 */
export async function markReviewInvitationDeleted(uri) {
  await pool.query(
    `UPDATE app_review_invitations
     SET deleted = true, indexed_at = now()
     WHERE uri = $1`,
    [uri],
  );
}

/**
 * Upsert a review response into app_review_responses.
 * After indexing, runs a quorum check and updates review_status if a decision is reached.
 */
export async function upsertReviewResponseDb(clientOrPool, params) {
  const { uri, cid, did, rkey, record } = params;

  const argumentUri = record.argument ?? null;
  const reviewerDid = record.reviewer ?? null;
  const criteria = record.criteria ? JSON.stringify(record.criteria) : null;
  const vote = record.vote ?? null;
  const justification = record.justification ?? null;
  const createdAt = record.createdAt ? new Date(record.createdAt) : new Date();

  await dbQuery(
    clientOrPool,
    `
    INSERT INTO app_review_responses
      (uri, cid, argument_uri, reviewer_did, criteria, vote, justification, created_at, deleted)
    VALUES
      ($1,  $2,  $3,           $4,           $5,       $6,   $7,            $8,         false)
    ON CONFLICT (uri) DO UPDATE SET
      cid           = EXCLUDED.cid,
      argument_uri  = EXCLUDED.argument_uri,
      reviewer_did  = EXCLUDED.reviewer_did,
      criteria      = EXCLUDED.criteria,
      vote          = EXCLUDED.vote,
      justification = EXCLUDED.justification,
      created_at    = EXCLUDED.created_at,
      deleted       = false,
      indexed_at    = now()
    `,
    [uri, cid, argumentUri, reviewerDid, criteria, vote, justification, createdAt],
  );

  // Post-index quorum check
  if (argumentUri) {
    await checkReviewQuorum(clientOrPool, argumentUri);
  }
}

/**
 * Check if a peer-review quorum has been reached for an argument.
 * If so, update review_status to 'approved' or 'rejected'.
 * The actual governance PDS copy is created by the appview background loop.
 */
async function checkReviewQuorum(clientOrPool, argumentUri) {
  const quorum = parseInt(process.env.PEER_REVIEW_QUORUM || "10", 10);

  const counts = await dbQuery(
    clientOrPool,
    `
    SELECT
      COUNT(*) FILTER (WHERE vote = 'APPROVE') AS approvals,
      COUNT(*) FILTER (WHERE vote = 'REJECT') AS rejections,
      COUNT(*) AS total
    FROM app_review_responses
    WHERE argument_uri = $1 AND NOT deleted
    `,
    [argumentUri],
  );

  const row = counts.rows[0];
  if (!row) return;

  const approvals = parseInt(row.approvals, 10);
  const total = parseInt(row.total, 10);
  const remaining = quorum - total;
  const threshold = quorum / 2;

  if (approvals > threshold) {
    await dbQuery(
      clientOrPool,
      `UPDATE app_arguments SET review_status = 'approved', indexed_at = now()
       WHERE uri = $1 AND review_status = 'preliminary'`,
      [argumentUri],
    );
    console.log(`Argument approved by quorum: ${argumentUri}`);
  } else if (approvals + remaining <= threshold) {
    await dbQuery(
      clientOrPool,
      `UPDATE app_arguments SET review_status = 'rejected', indexed_at = now()
       WHERE uri = $1 AND review_status = 'preliminary'`,
      [argumentUri],
    );
    console.log(`Argument rejected by quorum: ${argumentUri}`);
  }
}

/**
 * Soft-delete a review response.
 */
export async function markReviewResponseDeleted(uri) {
  await pool.query(
    `UPDATE app_review_responses
     SET deleted = true, indexed_at = now()
     WHERE uri = $1`,
    [uri],
  );
}
