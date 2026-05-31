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

const ARGUMENT_NSID = "app.ch.poltr.ballot.argument";

/**
 * Parse the source union of an argument record into flat DB fields.
 *
 * Handles three cases:
 *   - Explicit `source` union with `$type` set to one of the three refs
 *   - Legacy records without `source` but with top-level `authorDid`
 *     (treated as sourceUser as a backward-compatibility fallback)
 */
function parseArgumentSource(record) {
  const source = record.source;
  const refUser = `${ARGUMENT_NSID}#sourceUser`;
  const refOfficial = `${ARGUMENT_NSID}#sourceOfficial`;
  const refOrg = `${ARGUMENT_NSID}#sourceOrganization`;

  if (source && typeof source === "object") {
    const t = source.$type;
    if (t === refOfficial) {
      return {
        sourceType: "official",
        sourceOrgKey: null,
        sourceDocRef: source.documentRef ?? null,
        sourceSection: source.section ?? null,
        sourceVerifiedDid: null,
        authorDid: null,
      };
    }
    if (t === refOrg) {
      return {
        sourceType: "organization",
        sourceOrgKey: source.orgKey ?? null,
        sourceDocRef: source.documentRef ?? null,
        sourceSection: null,
        sourceVerifiedDid: source.verifiedDid ?? null,
        authorDid: null,
      };
    }
    if (t === refUser) {
      return {
        sourceType: "user",
        sourceOrgKey: null,
        sourceDocRef: null,
        sourceSection: null,
        sourceVerifiedDid: null,
        authorDid: source.authorDid ?? record.authorDid ?? null,
      };
    }
  }

  // Legacy record without a source union: assume user-submitted.
  return {
    sourceType: "user",
    sourceOrgKey: null,
    sourceDocRef: null,
    sourceSection: null,
    sourceVerifiedDid: null,
    authorDid: record.authorDid ?? null,
  };
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

  const src = parseArgumentSource(record);

  // Curated content (official/organization) skips peer review.
  // For user-submitted args we keep the existing 'preliminary' default on insert
  // so the peer-review workflow can promote them later.
  const reviewStatus = src.sourceType === "user" ? "preliminary" : "approved";

  await dbQuery(
    clientOrPool,
    `
    INSERT INTO app_arguments
      (uri, cid, did, rkey, author_did, title, body, type, ballot_uri, ballot_rkey,
       source_type, source_org_key, source_doc_ref, source_section, source_verified_did,
       review_status, created_at, deleted)
    VALUES
      ($1,  $2,  $3,  $4,  $5,  $6,    $7,   $8,   $9,         $10,
       $11, $12, $13, $14, $15,
       $16, $17, false)
    ON CONFLICT (uri) DO UPDATE SET
      cid                  = EXCLUDED.cid,
      author_did           = EXCLUDED.author_did,
      title                = EXCLUDED.title,
      body                 = EXCLUDED.body,
      type                 = EXCLUDED.type,
      ballot_uri           = EXCLUDED.ballot_uri,
      ballot_rkey          = EXCLUDED.ballot_rkey,
      source_type          = EXCLUDED.source_type,
      source_org_key       = EXCLUDED.source_org_key,
      source_doc_ref       = EXCLUDED.source_doc_ref,
      source_section       = EXCLUDED.source_section,
      source_verified_did  = EXCLUDED.source_verified_did,
      created_at           = EXCLUDED.created_at,
      deleted              = false,
      indexed_at           = now()
    `,
    [
      uri,
      cid,
      did,
      rkey,
      src.authorDid,
      title,
      body,
      type,
      ballotUri,
      ballotRkey,
      src.sourceType,
      src.sourceOrgKey,
      src.sourceDocRef,
      src.sourceSection,
      src.sourceVerifiedDid,
      reviewStatus,
      createdAt,
    ],
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
 *
 * Upsert a Bluesky thread post into app_comments (origin = 'extern').
 * On conflict, updates engagement counts but preserves text.
 */
export async function upsertBskyThreadPost(params) {
  const {
    uri,
    cid,
    did,
    rkey,
    text,
    ballotUri,
    ballotRkey,
    parentUri,
    argumentUri,
    bskyPostUri,
    bskyPostCid,
    handle,
    displayName,
    likeCount,
    repostCount,
    replyCount,
    createdAt,
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
      uri,
      cid,
      did,
      rkey,
      text,
      ballotUri,
      ballotRkey,
      parentUri,
      argumentUri ?? null,
      bskyPostUri,
      bskyPostCid,
      handle,
      displayName,
      likeCount ?? 0,
      repostCount ?? 0,
      replyCount ?? 0,
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
  const parentUri = record.parent ?? null;
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
       parent_uri, argument_uri, created_at, deleted)
    VALUES
      ($1,  $2,  $3,  $4,  'intern', $5,  $6,  $7,         $8,
       $9, $10,  $11, false)
    ON CONFLICT (uri) DO UPDATE SET
      cid          = EXCLUDED.cid,
      title        = EXCLUDED.title,
      text         = EXCLUDED.text,
      ballot_uri   = EXCLUDED.ballot_uri,
      ballot_rkey  = EXCLUDED.ballot_rkey,
      parent_uri   = EXCLUDED.parent_uri,
      argument_uri = EXCLUDED.argument_uri,
      created_at   = EXCLUDED.created_at,
      deleted      = false,
      indexed_at   = now()
    `,
    [
      uri,
      cid,
      did,
      rkey,
      title,
      body,
      ballotUri,
      ballotRkey,
      parentUri,
      argumentUri,
      createdAt,
    ],
  );

  if (argumentUri) {
    await refreshCommentCount(clientOrPool, argumentUri);
  }
}

/**
 * Soft-delete a comment and refresh counts on parent argument.
 */
export async function markCommentDeleted(uri) {
  const res = await pool.query(
    `UPDATE app_comments
     SET deleted = true, indexed_at = now()
     WHERE uri = $1
     RETURNING argument_uri`,
    [uri],
  );

  const argumentUri = res.rows?.[0]?.argument_uri;
  if (argumentUri) {
    await refreshCommentCount(pool, argumentUri);
  }
}

/**
 * Recount non-deleted comments and update app_arguments.comment_count.
 */
async function refreshCommentCount(clientOrPool, argumentUri) {
  await dbQuery(
    clientOrPool,
    `
    UPDATE app_arguments
    SET comment_count = (
      SELECT count(*) FROM app_comments
      WHERE argument_uri = $1 AND NOT deleted
    )
    WHERE uri = $1
    `,
    [argumentUri],
  );
}

export async function refreshLikeCount(clientOrPool, subjectUri) {
  const countSql = `(SELECT count(*) FROM app_likes WHERE subject_uri = $1 AND NOT deleted)`;
  await dbQuery(
    clientOrPool,
    `UPDATE app_arguments SET like_count = ${countSql} WHERE uri = $1`,
    [subjectUri],
  );
  await dbQuery(
    clientOrPool,
    `UPDATE app_comments SET like_count = ${countSql} WHERE uri = $1`,
    [subjectUri],
  );
}

/**
 * Insert a review invitation. Once created, the decision is immutable:
 * - ON CONFLICT (uri): do nothing (ignore re-indexing of the same record)
 * - ON CONFLICT (argument_uri, invitee_did): do nothing (one decision per user per argument, forever)
 */
export async function upsertReviewInvitationDb(clientOrPool, params) {
  const { uri, cid, record } = params;

  const argumentUri = record.argument ?? null;
  const inviteeDid = record.invitee ?? null;
  const invited = record.invited ?? true;
  const createdAt = record.createdAt ? new Date(record.createdAt) : new Date();

  await dbQuery(
    clientOrPool,
    `
    INSERT INTO app_review_invitations
      (uri, cid, argument_uri, invitee_did, invited, created_at)
    VALUES
      ($1,  $2,  $3,           $4,          $5,      $6)
    ON CONFLICT DO NOTHING
    `,
    [uri, cid, argumentUri, inviteeDid, invited, createdAt],
  );
}

/**
 * Ignore deletion of review invitations — decisions are immutable.
 */
export async function markReviewInvitationDeleted(uri) {
  console.log(`Ignoring delete for review invitation (immutable): ${uri}`);
}

/**
 * Upsert a review response into app_review_responses.
 * After indexing, runs a quorum check and updates review_status if a decision is reached.
 */
export async function upsertReviewResponseDb(clientOrPool, params) {
  const { uri, cid, record } = params;

  const argumentUri = record.argument ?? null;
  const reviewerDid = record.reviewer ?? null;
  const criteria = record.criteria ? JSON.stringify(record.criteria) : null;
  const vote = record.vote ?? null;
  const justification = record.justification ?? null;
  const createdAt = record.createdAt ? new Date(record.createdAt) : new Date();

  const result = await dbQuery(
    clientOrPool,
    `
    INSERT INTO app_review_responses
      (uri, cid, argument_uri, reviewer_did, criteria, vote, justification, created_at)
    VALUES
      ($1,  $2,  $3,           $4,           $5,       $6,   $7,            $8)
    ON CONFLICT DO NOTHING
    RETURNING argument_uri
    `,
    [
      uri,
      cid,
      argumentUri,
      reviewerDid,
      criteria,
      vote,
      justification,
      createdAt,
    ],
  );

  // Post-index quorum check (only if a new row was actually inserted)
  const inserted = result.rows?.length > 0;
  if (inserted && argumentUri) {
    await checkReviewQuorum(clientOrPool, argumentUri);
  }
}

/**
 * Check if a peer-review quorum has been reached for an argument.
 * If so, update review_status to 'approved' or 'rejected'.
 */
async function checkReviewQuorum(clientOrPool, argumentUri) {
  const quorum = parseInt(process.env.APPVIEW_PEER_REVIEW_QUORUM || "10", 10);

  // Only count responses backed by an issued invitation (invited=true) for the
  // same (argument, reviewer). Defense in depth: even if a response record ever
  // reaches the DB without a matching invitation, it must not sway the quorum.
  const counts = await dbQuery(
    clientOrPool,
    `
    SELECT
      COUNT(*) FILTER (WHERE rr.vote = 'APPROVE') AS approvals,
      COUNT(*) FILTER (WHERE rr.vote = 'REJECT') AS rejections,
      COUNT(*) AS total
    FROM app_review_responses rr
    JOIN app_review_invitations ri
      ON ri.argument_uri = rr.argument_uri
     AND ri.invitee_did  = rr.reviewer_did
     AND ri.invited      = true
    WHERE rr.argument_uri = $1
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
 * Ignore deletion of review responses — decisions are immutable.
 */
export async function markReviewResponseDeleted(uri) {
  console.log(`Ignoring delete for review response (immutable): ${uri}`);
}
