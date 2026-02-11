
import { CID } from 'multiformats/cid';
import 'dotenv/config'
import { pool, upsertBallotDb, markDeleted, upsertLikeDb, markLikeDeleted, upsertProfileDb, deleteProfile } from './db.js'

const COLLECTION_BALLOT    = 'app.ch.poltr.ballot.entry'
const COLLECTION_LIKE      = 'app.ch.poltr.ballot.like'
const COLLECTION_PSEUDONYM = 'app.ch.poltr.actor.pseudonym'

export const handleEvent = async (evt) => {
  const collection = evt.collection

  if (collection !== COLLECTION_BALLOT && collection !== COLLECTION_LIKE && collection !== COLLECTION_PSEUDONYM) return

  console.log('DEBUG -handleEvent => Received event for collection:', collection);

  const cidString = CID.asCID(evt.cid)?.toString();
  const did = evt.did;
  const uri = evt.uri.toString();
  const rkey = evt.rkey;
  const action = evt.event;

  if (collection === COLLECTION_BALLOT) {
    if (action === 'delete') {
      await markDeleted(uri);
      return
    }
    if (action === 'create' || action === 'update') {
      const record = evt.record;
      if (!record) return;
      await upsertBallotDb(pool, { uri, cid: cidString, did, rkey, record });
    }
  }

  if (collection === COLLECTION_LIKE) {
    if (action === 'delete') {
      await markLikeDeleted(uri);
      return
    }
    if (action === 'create' || action === 'update') {
      const record = evt.record;
      if (!record) return;
      await upsertLikeDb(pool, { uri, cid: cidString, did, rkey, record });
    }
  }

  if (collection === COLLECTION_PSEUDONYM) {
    if (action === 'delete') {
      await deleteProfile(did);
      return
    }
    if (action === 'create' || action === 'update') {
      const record = evt.record;
      if (!record) return;
      await upsertProfileDb(pool, { did, record });
    }
  }
};
