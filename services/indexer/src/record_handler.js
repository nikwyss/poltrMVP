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
  projectTaxonomySnapshotDb,
  stageForAcceptance,
} from "./db.js";

const COLLECTION_ARGUMENT = "app.ch.poltr.ballot.argument";
const COLLECTION_RATING = "app.ch.poltr.content.rating";
const COLLECTION_COMMENT = "app.ch.poltr.comment";
const COLLECTION_COMMENT_TRANSLATION = "app.ch.poltr.comment.translation";
const COLLECTION_PEERREVIEW_INVITATION = "app.ch.poltr.peerreview.invitation";
const COLLECTION_PEERREVIEW_RESPONSE = "app.ch.poltr.peerreview.response";
// Pull-Trigger (Phase 6): user-authored „bitte mir Reviews zuteilen". Wird in die
// Akzeptanz-Queue (kind=request) gestaged; der Writer führt die Zuteilung aus.
const COLLECTION_PEERREVIEW_REQUEST = "app.ch.poltr.peerreview.request";
// Taxonomie-Snapshot: ganzer Themen-Baum eines Ballots als EIN Record (Quelle der
// Wahrheit); wird in app_taxonomy_node/_membership projiziert.
const COLLECTION_TAXONOMY_SNAPSHOT = "app.ch.poltr.taxonomy.snapshot";
// Legacy NSIDs: existing records on PDS remain under these. Kept so the firehose
// backfill path can re-index any records that landed before the rename.
const COLLECTION_REVIEW_INVITATION_LEGACY = "app.ch.poltr.review.invitation";
const COLLECTION_REVIEW_RESPONSE_LEGACY = "app.ch.poltr.review.response";

// ATProto-native acceptance pipeline (Phase 3): when enabled, user-authored
// `ballot.argument` creates from USER repos are staged into app_acceptance_queue
// for the writer (gate → community record) instead of being ignored. Off by
// default — the pipeline is dormant until appview writes args to user repos
// (APPVIEW_ARGS_USER_REPO_ENABLED) and the writer consumes the queue.
const ACCEPTANCE_PIPELINE_ENABLED =
  (process.env.ACCEPTANCE_PIPELINE_ENABLED ?? "false") === "true";

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
    collection !== COLLECTION_PEERREVIEW_REQUEST &&
    collection !== COLLECTION_REVIEW_INVITATION_LEGACY &&
    collection !== COLLECTION_REVIEW_RESPONSE_LEGACY &&
    collection !== COLLECTION_TAXONOMY_SNAPSHOT
  )
    return;

  const cidString = CID.asCID(evt.cid)?.toString();
  const did = evt.did;
  const uri = evt.uri.toString();
  const rkey = evt.rkey;
  const action = evt.event;

  if (collection === COLLECTION_ARGUMENT) {
    if (!isGovernanceDid(did)) {
      if (ACCEPTANCE_PIPELINE_ENABLED && action === "create" && evt.record) {
        // ATProto-native: a user wrote a self-signed argument into their OWN
        // repo. Stage it for the writer (gate → community record). The writer's
        // governance-authored community record returns here as an
        // isGovernanceDid(did) event and is projected the normal way (below).
        // Update/Delete of the user original are ignored (drift solved).
        await stageForAcceptance(pool, {
          userUri: uri,
          userCid: cidString,
          did,
          kind: "argument",
          ballot: evt.record.ballot != null ? String(evt.record.ballot) : null,
          record: evt.record,
        });
        return;
      }
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
      if (
        ACCEPTANCE_PIPELINE_ENABLED &&
        action === "create" &&
        evt.record &&
        collection === COLLECTION_PEERREVIEW_RESPONSE
      ) {
        // ATProto-native: a reviewer wrote a self-signed response into their OWN
        // repo. Stage it for the writer (gate → community response). No ballot
        // ref — the writer resolves the governance repo from record.argument.
        await stageForAcceptance(pool, {
          userUri: uri,
          userCid: cidString,
          did,
          kind: "response",
          ballot: null,
          record: evt.record,
        });
        return;
      }
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

  if (collection === COLLECTION_PEERREVIEW_REQUEST) {
    // Pull-Trigger (Phase 6): user-authored Bitte um Review-Zuteilung → stagen
    // (kind=request); der Writer führt _assign aus und schreibt die Invitations
    // ins Governance-Repo. Nicht projizieren (kein Lese-Modell für Requests).
    if (
      ACCEPTANCE_PIPELINE_ENABLED &&
      action === "create" &&
      evt.record &&
      !isGovernanceDid(did)
    ) {
      await stageForAcceptance(pool, {
        userUri: uri,
        userCid: cidString,
        did,
        kind: "request",
        ballot: null,
        record: evt.record,
      });
    }
    return;
  }

  if (collection === COLLECTION_TAXONOMY_SNAPSHOT) {
    // Quelle der Wahrheit für die Taxonomie. Nur aus Governance-Repos akzeptieren.
    if (!isGovernanceDid(did)) {
      console.log(`Ignoring taxonomy.snapshot from non-governance repo: ${did}`);
      return;
    }
    // Append-only: ein Snapshot-Delete ist kein normaler Flow — die DB behält den
    // zuletzt projizierten Stand. Nur create/update projizieren.
    if (action === "create" || action === "update") {
      const record = evt.record;
      if (!record) return;
      await projectTaxonomySnapshotDb({ did, record });
    }
  }
};
