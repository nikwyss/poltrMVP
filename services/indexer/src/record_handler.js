
import { CID } from 'multiformats/cid';
import 'dotenv/config'
import { pool,  upsertProposalDb, markDeleted } from './db.js'


export const handleEvent = async (evt) => {
  // Only care about proposal records

  console.log('DEBUG -handleEvent => Received event for collection:', evt.collection);
  // if (evt.collection !== 'app.ch.poltr.vote.proposal') return;



// assuming your CID field is already a CID object:
  const cidString = CID.asCID(evt.cid)?.toString();

  // const seq = evt.seq;         // firehose cursor
  const did = evt.did;
  const uri = evt.uri.toString();   // already built
  const rkey = evt.rkey;
  const action = evt.event;    // 'create' | 'update' | 'delete' (check lib docs)

  if (action === 'delete') {
    await markDeleted(uri);
  }

  if (action === 'create' || action === 'update') {
    const record = evt.record;
    if (!record) return;

    await upsertProposalDb(pool, {
      uri,
      cid: cidString, // or evt.cid if your helper exposes it
      did,
      rkey,
      record,
    });
  }
};
