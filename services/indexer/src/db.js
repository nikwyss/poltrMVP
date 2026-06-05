import "dotenv/config";
import { Pool } from "pg";
import process from "node:process";
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from "./languages.js";

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
 * Derive translation_status from a record's `langs` (original) + `translations` array.
 *
 *   - `pending`     : only the original language(s) are present
 *   - `partial`     : at least one translation but not all SUPPORTED_LANGUAGES covered
 *   - `complete`    : every SUPPORTED_LANGUAGES code is either an original or a translation
 *   - `manual_only` : complete AND every translation has source='manual' (frozen, no AI run)
 *
 * Driven by the dynamic SUPPORTED_LANGUAGES list — adding a language flips
 * previously-complete records to 'partial' automatically (the worker will pick
 * them up on the next firehose event or via a one-shot SQL backfill).
 */
function deriveTranslationStatus(langs, translations) {
  const origin = Array.isArray(langs) && langs.length ? langs : [DEFAULT_LANGUAGE];
  const tx = Array.isArray(translations) ? translations : [];
  const covered = new Set([
    ...origin,
    ...tx.map((t) => t?.lang).filter(Boolean),
  ]);
  const allCovered = SUPPORTED_LANGUAGES.every((l) => covered.has(l));
  if (allCovered) {
    const allManual = tx.length > 0 && tx.every((t) => t?.source === "manual");
    return allManual ? "manual_only" : "complete";
  }
  return tx.length > 0 ? "partial" : "pending";
}

/**
 * Normalize a record's `langs` field: accept array, fall back to [DEFAULT_LANGUAGE].
 * Returned value is suitable for direct binding to a Postgres TEXT[] column.
 */
function normalizeLangs(langs) {
  if (Array.isArray(langs) && langs.length) {
    return langs.filter((l) => typeof l === "string" && l.length > 0);
  }
  return [DEFAULT_LANGUAGE];
}

/**
 * Normalize a record's `translations` field for JSONB storage.
 * Drops malformed entries (missing lang/title-or-text/body); returns [] if absent.
 */
function normalizeTranslations(translations, { requireTitle = true } = {}) {
  if (!Array.isArray(translations)) return [];
  return translations.filter((t) => {
    if (!t || typeof t !== "object") return false;
    if (typeof t.lang !== "string") return false;
    if (requireTitle && typeof t.title !== "string") return false;
    if (typeof t.body !== "string") return false;
    return true;
  });
}

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

function _peerReviewQuorum() {
  return parseInt(process.env.APPVIEW_PEER_REVIEW_QUORUM || "10", 10);
}

function _peerReviewGraceSeconds() {
  return parseInt(
    process.env.APPVIEW_PEER_REVIEW_GRACE_PERIOD_SECONDS || "600",
    10,
  );
}

/**
 * Upsert an argument record into app_arguments. For user-submitted arguments
 * we also seed the app_peerreviews lifecycle row in the same transaction so
 * downstream code can rely on "every user argument has a peerreview row".
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

  const langs = normalizeLangs(record.langs);
  const translations = normalizeTranslations(record.translations);
  const translationStatus = deriveTranslationStatus(langs, translations);

  await dbQuery(
    clientOrPool,
    `
    INSERT INTO app_arguments
      (uri, cid, did, rkey, author_did, title, body, type, ballot_uri, ballot_rkey,
       source_type, source_org_key, source_doc_ref, source_section, source_verified_did,
       peerreview_status, langs, translations, translation_status, created_at, deleted)
    VALUES
      ($1,  $2,  $3,  $4,  $5,  $6,    $7,   $8,   $9,         $10,
       $11, $12, $13, $14, $15,
       $16, $17, $18::jsonb, $19, $20, false)
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
      langs                = EXCLUDED.langs,
      translations         = EXCLUDED.translations,
      translation_status   = EXCLUDED.translation_status,
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
      langs,
      JSON.stringify(translations),
      translationStatus,
      createdAt,
    ],
  );

  // Seed the peer-review lifecycle row for user-submitted arguments. ON CONFLICT
  // DO NOTHING because firehose replay may re-upsert the argument, but the row
  // is immutable here — its lifecycle is only ever advanced by the response /
  // finaliser code paths.
  if (src.sourceType === "user") {
    await dbQuery(
      clientOrPool,
      `
      INSERT INTO app_peerreviews (argument_uri, state, quorum, opened_at)
      VALUES ($1, 'open', $2, $3)
      ON CONFLICT (argument_uri) DO NOTHING
      `,
      [uri, _peerReviewQuorum(), createdAt],
    );
  }
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
 * Hard-delete the machine-derived analysis rows tied to an argument: open codes
 * (Calculator) and the taxonomy/axis memberships. These are recomputable output,
 * NOT democratic content, so removing them on argument deletion is safe and keeps
 * the analysis tables free of orphans.
 *
 * Deliberately NOT touched here:
 *   - peer reviews (app_peerreview_*) — democratically sensitive; never deleted,
 *     only hidden via read-filters (`NOT a.deleted` on the joined argument).
 *   - comments / likes — soft-delete columns + read-filters handle them.
 */
export async function cascadeDeleteArgumentDerived(uri) {
  await pool.query(`DELETE FROM app_argument_open_codes WHERE argument_uri = $1`, [uri]);
  await pool.query(`DELETE FROM app_topic_membership    WHERE argument_uri = $1`, [uri]);
  await pool.query(`DELETE FROM app_taxonomy_membership WHERE argument_uri = $1`, [uri]);
  await pool.query(`DELETE FROM app_arguments_axis      WHERE argument_uri = $1`, [uri]);
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

  const langs = normalizeLangs(record.langs);

  await dbQuery(
    clientOrPool,
    `
    INSERT INTO app_comments
      (uri, cid, did, rkey, origin, title, text, ballot_uri, ballot_rkey,
       parent_uri, argument_uri, langs, created_at, deleted)
    VALUES
      ($1,  $2,  $3,  $4,  'intern', $5,  $6,  $7,         $8,
       $9, $10,  $11, $12, false)
    ON CONFLICT (uri) DO UPDATE SET
      cid          = EXCLUDED.cid,
      title        = EXCLUDED.title,
      text         = EXCLUDED.text,
      ballot_uri   = EXCLUDED.ballot_uri,
      ballot_rkey  = EXCLUDED.ballot_rkey,
      parent_uri   = EXCLUDED.parent_uri,
      argument_uri = EXCLUDED.argument_uri,
      langs        = EXCLUDED.langs,
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
      langs,
      createdAt,
    ],
  );

  // Recompute translation_status against the (separately indexed) sidecar
  // table. Safe on out-of-order firehose: sidecars indexed before their parent
  // also call back into this function (via upsertCommentTranslationDb).
  await recomputeCommentTranslationStatus(clientOrPool, uri);

  if (argumentUri) {
    await refreshCommentCount(clientOrPool, argumentUri);
  }
}

/**
 * Upsert a sidecar-translation record for a comment.
 * NSID: app.ch.poltr.comment.translation
 *
 * The unique `(subject_uri, lang)` constraint guarantees one translation per
 * (comment, language) pair; the worker's composed rkey `{commentRkey}-{lang}`
 * makes putRecord overwrite idempotent on the PDS side too.
 */
export async function upsertCommentTranslationDb(clientOrPool, params) {
  const { uri, cid, record } = params;

  const subjectUri = record?.subject?.uri ?? null;
  if (!subjectUri) return; // malformed record — drop silently

  const ballotRkey = record.ballot ?? null;
  const lang = record.lang ?? null;
  const body = record.body ?? null;
  const source = record.source === "manual" ? "manual" : "ai";
  const model = record.model ?? null;
  const translatedAt = record.translatedAt
    ? new Date(record.translatedAt)
    : new Date();

  if (!lang || !body) return;

  await dbQuery(
    clientOrPool,
    `
    INSERT INTO app_comment_translations
      (uri, cid, subject_uri, ballot_rkey, lang, body, source, model, translated_at, deleted)
    VALUES
      ($1,  $2,  $3,          $4,          $5,   $6,   $7,     $8,    $9,            false)
    ON CONFLICT (uri) DO UPDATE SET
      cid           = EXCLUDED.cid,
      subject_uri   = EXCLUDED.subject_uri,
      ballot_rkey   = EXCLUDED.ballot_rkey,
      lang          = EXCLUDED.lang,
      body          = EXCLUDED.body,
      source        = EXCLUDED.source,
      model         = EXCLUDED.model,
      translated_at = EXCLUDED.translated_at,
      deleted       = false,
      indexed_at    = now()
    `,
    [uri, cid, subjectUri, ballotRkey, lang, body, source, model, translatedAt],
  );

  await recomputeCommentTranslationStatus(clientOrPool, subjectUri);
}

/**
 * Soft-delete a comment translation sidecar and recompute parent status.
 */
export async function markCommentTranslationDeleted(uri) {
  const res = await pool.query(
    `UPDATE app_comment_translations
     SET deleted = true, indexed_at = now()
     WHERE uri = $1
     RETURNING subject_uri`,
    [uri],
  );
  const subjectUri = res.rows?.[0]?.subject_uri;
  if (subjectUri) {
    await recomputeCommentTranslationStatus(pool, subjectUri);
  }
}

/**
 * Compute translation_status for a comment by union-ing its original `langs`
 * with the set of non-deleted sidecar translations pointing at its URI.
 *
 * Status semantics mirror Arguments: pending → partial → complete. The
 * sidecar-source vs. inline-source distinction is invisible at this layer.
 */
async function recomputeCommentTranslationStatus(clientOrPool, commentUri) {
  const cRes = await dbQuery(
    clientOrPool,
    `SELECT langs FROM app_comments WHERE uri = $1`,
    [commentUri],
  );
  if (!cRes.rows.length) return; // parent not yet indexed; will recompute later
  const originLangs = cRes.rows[0].langs || [DEFAULT_LANGUAGE];

  const tRes = await dbQuery(
    clientOrPool,
    `SELECT lang, source FROM app_comment_translations
     WHERE subject_uri = $1 AND NOT deleted`,
    [commentUri],
  );
  const txLangs = tRes.rows.map((r) => r.lang);
  const txSources = tRes.rows.map((r) => r.source);

  const covered = new Set([...originLangs, ...txLangs]);
  const allCovered = SUPPORTED_LANGUAGES.every((l) => covered.has(l));

  let status;
  if (allCovered) {
    const allManual =
      txSources.length > 0 && txSources.every((s) => s === "manual");
    status = allManual ? "manual_only" : "complete";
  } else {
    status = txLangs.length > 0 ? "partial" : "pending";
  }

  await dbQuery(
    clientOrPool,
    `UPDATE app_comments SET translation_status = $1 WHERE uri = $2`,
    [status, commentUri],
  );
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
export async function upsertPeerreviewInvitationDb(clientOrPool, params) {
  const { uri, cid, record } = params;

  const argumentUri = record.argument ?? null;
  const inviteeDid = record.invitee ?? null;
  const invited = record.invited ?? true;
  const createdAt = record.createdAt ? new Date(record.createdAt) : new Date();

  await dbQuery(
    clientOrPool,
    `
    INSERT INTO app_peerreview_invitations
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
export async function markPeerreviewInvitationDeleted(uri) {
  console.log(`Ignoring delete for review invitation (immutable): ${uri}`);
}

/**
 * Upsert a review response into app_peerreview_responses.
 * After indexing, runs a quorum check and updates peerreview_status if a decision is reached.
 */
export async function upsertPeerreviewResponseDb(clientOrPool, params) {
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
    INSERT INTO app_peerreview_responses
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
 * Per-response post-index hook: if the response just landed completes the
 * review (either by reaching quorum or by mathematically locking the outcome),
 * transition the review from 'open' to 'provisional_closed' and open a grace
 * window. The final outcome (approved/rejected) is computed later by
 * finalizeExpiredPeerReviews when grace_until expires — the goal of the
 * grace window is to let already-checked-in reviewers finish without losing
 * work.
 *
 * Three closure triggers (any one suffices):
 *   - quorum reached:  total >= quorum
 *   - locked approve:  approvals  > rejections + remaining
 *   - locked reject:   rejections >= approvals + remaining
 * where remaining = max(0, quorum - total). At/past quorum, remaining = 0 and
 * the locked-conditions reduce to the regular at-quorum decision (one of them
 * is always true). Locks are "locked at trigger time" — already-checked-in
 * reviewers can still submit during the grace window and may even flip the
 * outcome math, which is by design.
 *
 * Only counts responses backed by an issued invitation (invited=true) for the
 * same (argument, reviewer). Defense in depth: stray responses without a
 * matching invitation must not sway the quorum.
 *
 * The UPDATE is guarded with state='open' so concurrent closure-triggering
 * submits both observe a consistent transition: whichever commits second is a
 * no-op for the state column, and grace_until is overwritten with a near-
 * identical value (harmless). Over-counted responses (Q+1, Q+2, …) are
 * intentional and welcome — more data, no loss.
 */
async function checkReviewQuorum(clientOrPool, argumentUri) {
  const graceSeconds = _peerReviewGraceSeconds();

  // Quorum is per-review: app_peerreviews.quorum captures the env default at
  // row creation. Reading the column (not the env) here makes future per-ballot
  // tuning take effect and implicitly skips already-closed reviews.
  const pr = await dbQuery(
    clientOrPool,
    `SELECT quorum FROM app_peerreviews WHERE argument_uri = $1 AND state = 'open'`,
    [argumentUri],
  );
  if (!pr.rows.length) return;
  const quorum = parseInt(pr.rows[0].quorum, 10);

  const counts = await dbQuery(
    clientOrPool,
    `
    SELECT
      COUNT(*) FILTER (WHERE rr.vote = 'APPROVE') AS approvals,
      COUNT(*) FILTER (WHERE rr.vote = 'REJECT')  AS rejections,
      COUNT(*) AS total
    FROM app_peerreview_responses rr
    JOIN app_peerreview_invitations ri
      ON ri.argument_uri = rr.argument_uri
     AND ri.invitee_did  = rr.reviewer_did
     AND ri.invited      = true
    WHERE rr.argument_uri = $1
    `,
    [argumentUri],
  );

  const row = counts.rows[0] || {};
  const approvals = parseInt(row.approvals ?? 0, 10);
  const rejections = parseInt(row.rejections ?? 0, 10);
  const total = parseInt(row.total ?? 0, 10);

  const remaining = Math.max(0, quorum - total);
  const quorumReached = total >= quorum;
  const lockedApprove = approvals > rejections + remaining;
  const lockedReject = rejections >= approvals + remaining;

  let reason;
  if (quorumReached) reason = "quorum";
  else if (lockedApprove) reason = "locked_approve";
  else if (lockedReject) reason = "locked_reject";
  else return;

  const upd = await dbQuery(
    clientOrPool,
    `UPDATE app_peerreviews
        SET state                 = 'provisional_closed',
            provisional_closed_at = now(),
            grace_until           = now() + ($2 || ' seconds')::interval
      WHERE argument_uri = $1 AND state = 'open'
      RETURNING grace_until`,
    [argumentUri, String(graceSeconds)],
  );

  if (upd.rows.length) {
    console.log(
      `Peer-review provisional close [${reason}] (A:${approvals} R:${rejections} total:${total}/${quorum}, grace ${graceSeconds}s): ${argumentUri}`,
    );
  }
}

/**
 * Finaliser: promote provisional_closed → closed for all reviews whose grace
 * window has expired, and compute the terminal outcome on app_arguments.
 * Called by the per-minute peerreview-finaliser cronjob.
 *
 * Single round-trip per expired review: one UPDATE to close, one parameterised
 * UPDATE on app_arguments per closed row. Outcome is approvals > rejections;
 * ties count as rejected (the proposal must earn its acceptance).
 *
 * Returns the count of finalised reviews for logging.
 */
export async function finalizeExpiredPeerReviews(clientOrPool = pool) {
  const expired = await dbQuery(
    clientOrPool,
    `UPDATE app_peerreviews
        SET state = 'closed', closed_at = now()
      WHERE state = 'provisional_closed' AND grace_until < now()
        AND EXISTS (
          SELECT 1 FROM app_arguments a
           WHERE a.uri = app_peerreviews.argument_uri AND NOT a.deleted
        )
      RETURNING argument_uri`,
  );

  let finalised = 0;
  for (const r of expired.rows) {
    const argumentUri = r.argument_uri;
    const counts = await dbQuery(
      clientOrPool,
      `
      SELECT
        COUNT(*) FILTER (WHERE rr.vote = 'APPROVE') AS approvals,
        COUNT(*) FILTER (WHERE rr.vote = 'REJECT') AS rejections,
        COUNT(*) AS total
      FROM app_peerreview_responses rr
      JOIN app_peerreview_invitations ri
        ON ri.argument_uri = rr.argument_uri
       AND ri.invitee_did  = rr.reviewer_did
       AND ri.invited      = true
      WHERE rr.argument_uri = $1
      `,
      [argumentUri],
    );

    const row = counts.rows[0] || {};
    const approvals = parseInt(row.approvals ?? 0, 10);
    const rejections = parseInt(row.rejections ?? 0, 10);
    const total = parseInt(row.total ?? 0, 10);
    const outcome = approvals > rejections ? "approved" : "rejected";

    // Guard on peerreview_status='preliminary' so we never demote a manually-set
    // terminal state. Same defensive pattern the old quorum check used.
    await dbQuery(
      clientOrPool,
      `UPDATE app_arguments
          SET peerreview_status = $2, indexed_at = now()
        WHERE uri = $1 AND peerreview_status = 'preliminary'`,
      [argumentUri, outcome],
    );

    console.log(
      `Peer-review finalised ${outcome} (${approvals}/${rejections}, total=${total}): ${argumentUri}`,
    );
    finalised += 1;
  }

  return { finalised };
}

/**
 * Ignore deletion of review responses — decisions are immutable.
 */
export async function markPeerreviewResponseDeleted(uri) {
  console.log(`Ignoring delete for review response (immutable): ${uri}`);
}
