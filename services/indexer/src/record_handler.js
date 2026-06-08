import { CID } from "multiformats/cid";
import "dotenv/config";
import {
  pool,
  upsertLikeDb,
  markLikeDeleted,
  upsertArgumentDb,
  markArgumentDeleted,
  cascadeDeleteArgumentDerived,
  upsertCommentDb,
  markCommentDeleted,
  upsertCommentTranslationDb,
  markCommentTranslationDeleted,
  upsertPeerreviewInvitationDb,
  markPeerreviewInvitationDeleted,
  upsertPeerreviewResponseDb,
  markPeerreviewResponseDeleted,
} from "./db.js";

const COLLECTION_ARGUMENT = "app.ch.poltr.ballot.argument";
const COLLECTION_RATING = "app.ch.poltr.content.rating";
const COLLECTION_COMMENT = "app.ch.poltr.comment";
const COLLECTION_COMMENT_TRANSLATION = "app.ch.poltr.comment.translation";
const COLLECTION_PEERREVIEW_INVITATION = "app.ch.poltr.peerreview.invitation";
const COLLECTION_PEERREVIEW_RESPONSE = "app.ch.poltr.peerreview.response";
// Legacy NSIDs: existing records on PDS remain under these. Kept so the firehose
// backfill path can re-index any records that landed before the rename.
const COLLECTION_REVIEW_INVITATION_LEGACY = "app.ch.poltr.review.invitation";
const COLLECTION_REVIEW_RESPONSE_LEGACY = "app.ch.poltr.review.response";

// Per-ballot governance accounts: loaded from DB
let governanceDids = new Set();

export async function refreshGovernanceDids() {
  try {
    const res = await pool.query("SELECT did FROM auth.governance_accounts");
    governanceDids = new Set(res.rows.map((r) => r.did));
    console.log(
      `Refreshed governance DIDs: ${governanceDids.size} account(s)`,
    );
  } catch (err) {
    console.error("Failed to refresh governance DIDs:", err.message);
  }
}

function isGovernanceDid(did) {
  return governanceDids.has(did);
}

export const handleEvent = async (evt) => {
  const collection = evt.collection;

  if (collection) {
    console.log("Handling event for collection:", collection);
  }
  if (
    collection !== COLLECTION_ARGUMENT &&
    collection !== COLLECTION_RATING &&
    collection !== COLLECTION_COMMENT &&
    collection !== COLLECTION_COMMENT_TRANSLATION &&
    collection !== COLLECTION_PEERREVIEW_INVITATION &&
    collection !== COLLECTION_PEERREVIEW_RESPONSE &&
    collection !== COLLECTION_REVIEW_INVITATION_LEGACY &&
    collection !== COLLECTION_REVIEW_RESPONSE_LEGACY
  )
    return;

  const cidString = CID.asCID(evt.cid)?.toString();
  const did = evt.did;
  const uri = evt.uri.toString();
  const rkey = evt.rkey;
  const action = evt.event;

  if (collection === COLLECTION_ARGUMENT) {
    if (!isGovernanceDid(did)) {
      console.log(`Ignoring argument from non-governance repo: ${did}`);
      return;
    }
    if (action === "delete") {
      // Soft-delete the argument (reads everywhere filter `NOT deleted`), then
      // clean up its machine-derived analysis rows (top-down topic memberships).
      // Peer reviews, comments and likes are NOT removed — they stay and are
      // hidden via read-filters (peer reviews are democratically sensitive and
      // must never be hard-deleted).
      await markArgumentDeleted(uri);
      await cascadeDeleteArgumentDerived(uri);
      return;
    }
    if (action === "create" || action === "update") {
      const record = evt.record;
      if (!record) return;
      await upsertArgumentDb(pool, { uri, cid: cidString, did, rkey, record });
    }
  }

  if (collection === COLLECTION_COMMENT) {
    if (action === "delete") {
      await markCommentDeleted(uri);
      return;
    }
    if (action === "create" || action === "update") {
      const record = evt.record;
      if (!record) return;
      await upsertCommentDb(pool, { uri, cid: cidString, did, rkey, record });
    }
  }

  if (collection === COLLECTION_COMMENT_TRANSLATION) {
    // Sidecar translations live in the ballot's governance account; reject
    // any record from a non-governance DID to keep moderation/auth invariants
    // identical to arguments/reviews.
    if (!isGovernanceDid(did)) {
      console.log(
        `Ignoring comment.translation from non-governance repo: ${did}`,
      );
      return;
    }
    if (action === "delete") {
      await markCommentTranslationDeleted(uri);
      return;
    }
    if (action === "create" || action === "update") {
      const record = evt.record;
      if (!record) return;
      await upsertCommentTranslationDb(pool, { uri, cid: cidString, record });
    }
  }

  if (collection === COLLECTION_RATING) {
    if (action === "delete") {
      await markLikeDeleted(uri);
      return;
    }
    if (action === "create" || action === "update") {
      const record = evt.record;
      if (!record) return;
      await upsertLikeDb(pool, { uri, cid: cidString, did, rkey, record });
    }
  }

  if (
    collection === COLLECTION_PEERREVIEW_INVITATION ||
    collection === COLLECTION_REVIEW_INVITATION_LEGACY
  ) {
    if (!isGovernanceDid(did)) {
      console.log(
        `Ignoring peerreview invitation from non-governance repo: ${did}`,
      );
      return;
    }
    if (action === "create") {
      const record = evt.record;
      if (!record) return;
      await upsertPeerreviewInvitationDb(pool, { uri, cid: cidString, record });
    }
  }

  if (
    collection === COLLECTION_PEERREVIEW_RESPONSE ||
    collection === COLLECTION_REVIEW_RESPONSE_LEGACY
  ) {
    if (!isGovernanceDid(did)) {
      console.log(`Ignoring peerreview response from non-governance repo: ${did}`);
      return;
    }
    if (action === "create") {
      const record = evt.record;
      if (!record) return;
      await upsertPeerreviewResponseDb(pool, {
        uri,
        cid: cidString,
        did,
        rkey,
        record,
      });
    }
  }
};
