
import 'dotenv/config'
import { pool,  upsertProposalDb, markDeleted } from './db.js'
import { setCursor } from './backfill_cursor.js'


export const handleEvent = async (evt) => {
  // Only care about proposal records

  console.log('DEBUG -handleEvent => Received event for collection:', evt.collection);
  // if (evt.collection !== 'app.ch.poltr.vote.proposal') return;

  const seq = evt.seq;         // firehose cursor
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
      cid: evt.commit, // or evt.cid if your helper exposes it
      did,
      rkey,
      record,
    });
  }

  // persist cursor AFTER successful processing
  // if (seq != null) {
  //   await setCursor('firehose:proposals', seq).catch((err) => {
  //     console.error('Error updating firehose cursor', err);
  //   });
  // }
};
