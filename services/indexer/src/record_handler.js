import { CID } from "multiformats/cid";
import "dotenv/config";
import process from "node:process";
import {
  pool,
  upsertBallotDb,
  markDeleted,
  upsertLikeDb,
  markLikeDeleted,
  upsertProfileDb,
  deleteProfile,
  getBskyPostUri,
  setBskyPostUri,
  getBskyPostForBallot,
  setBskyLikeUri,
} from "./db.js";
import { upsertBskyPost, createBskyLike } from "./pds_client.js";

const GOVERNANCE_DID = process.env.PDS_GOVERNANCE_ACCOUNT_DID;

const COLLECTION_BALLOT = "app.ch.poltr.ballot.entry";
const COLLECTION_RATING = "app.ch.poltr.content.rating";
const COLLECTION_PSEUDONYM = "app.ch.poltr.actor.pseudonym";

export const handleEvent = async (evt) => {
  const collection = evt.collection;

  if (collection) {
    console.log("Handling event for collection:", collection);
  }
  if (
    collection !== COLLECTION_BALLOT &&
    collection !== COLLECTION_RATING &&
    collection !== COLLECTION_PSEUDONYM
  )
    return;

  const cidString = CID.asCID(evt.cid)?.toString();
  const did = evt.did;
  const uri = evt.uri.toString();
  const rkey = evt.rkey;
  const action = evt.event;

  if (collection === COLLECTION_BALLOT) {
    if (action === "delete") {
      await markDeleted(uri);
      return;
    }
    if (action === "create" || action === "update") {
      const record = evt.record;
      if (!record) return;
      await upsertBallotDb(pool, { uri, cid: cidString, did, rkey, record });

      // Cross-post to Bluesky for governance ballots (create or update)
      if (GOVERNANCE_DID && did === GOVERNANCE_DID) {
        try {
          const existingPostUri = await getBskyPostUri(uri);
          const bskyResult = await upsertBskyPost(record, rkey, existingPostUri);
          if (bskyResult) {
            await setBskyPostUri(uri, bskyResult.uri, bskyResult.cid);
          }
        } catch (err) {
          console.error("Cross-post to Bluesky failed (non-blocking):", err);
        }
      }
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

      // Cross-like to Bluesky (best-effort, non-blocking)
      if (action === "create") {
        try {
          const bskyPost = await getBskyPostForBallot(record.subject?.uri);
          if (bskyPost) {
            const bskyLike = await createBskyLike(did, bskyPost.bsky_post_uri, bskyPost.bsky_post_cid);
            if (bskyLike) {
              await setBskyLikeUri(uri, bskyLike.uri);
            }
          }
        } catch (err) {
          console.error("Bsky cross-like failed (non-blocking):", err);
        }
      }
    }
  }

  if (collection === COLLECTION_PSEUDONYM) {
    if (action === "delete") {
      await deleteProfile(did);
      return;
    }
    if (action === "create" || action === "update") {
      const record = evt.record;
      if (!record) return;
      await upsertProfileDb(pool, { did, record });
    }
  }
};
