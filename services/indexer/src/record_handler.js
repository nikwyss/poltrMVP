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
} from "./db.js";
import { upsertBskyPost } from "./pds_client.js";

const GOVERNANCE_DID = process.env.PDS_GOVERNANCE_ACCOUNT_DID;

const COLLECTION_BALLOT = "app.ch.poltr.ballot.entry";
const COLLECTION_LIKE = "app.ch.poltr.ballot.like";
const COLLECTION_PSEUDONYM = "app.ch.poltr.actor.pseudonym";

export const handleEvent = async (evt) => {
  const collection = evt.collection;

  if (collection) {
    console.log("Handling event for collection:", collection);
  }
  if (
    collection !== COLLECTION_BALLOT &&
    collection !== COLLECTION_LIKE &&
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

  if (collection === COLLECTION_LIKE) {
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
