import type { BallotRecord } from '../types/ballots';
import { getAuthenticatedAgent, callAppXrpc } from './agent';
import { validateBallot } from './lexicons';


/**
 * Create a new ballot record
 */
export async function createBallot(
  ballot: Omit<BallotRecord, '$type' | 'createdAt'>
): Promise<{ uri: string; cid: string }> {
  // Add type and timestamp
  const record: BallotRecord = {
    $type: 'app.ch.poltr.ballot.entry',
    ...ballot,
    createdAt: new Date().toISOString(),
  };

  // Validate the record against the lexicon
  validateBallot(record);

  // Get authenticated agent
  const agent = await getAuthenticatedAgent();

  // Get user's DID
  const storedUser = localStorage.getItem('poltr_user');
  if (!storedUser) {
    throw new Error('No user in session');
  }
  const user = JSON.parse(storedUser);

  // Create the record using officialRef as rkey to prevent duplicates
  const response = await agent.com.atproto.repo.putRecord({
    repo: user.did,
    collection: 'app.ch.poltr.ballot.entry',
    rkey: ballot.officialRef,
    record: record as unknown as Record<string, unknown>,
  });

  return {
    uri: response.data.uri,
    cid: response.data.cid,
  };
}

/**
 * Delete a ballot record
 */
export async function deleteBallot(rkey: string): Promise<void> {
  const agent = await getAuthenticatedAgent();

  const storedUser = localStorage.getItem('poltr_user');
  if (!storedUser) {
    throw new Error('No user in session');
  }
  const user = JSON.parse(storedUser);

  await agent.com.atproto.repo.deleteRecord({
    repo: user.did,
    collection: 'app.ch.poltr.ballot.entry',
    rkey: rkey,
  });
}

/**
 * Like a ballot. Routes through the appview which writes to the PDS.
 * Returns the URI of the created like record.
 */
export async function likeBallot(
  subjectUri: string,
  subjectCid: string
): Promise<string> {
  const res = await callAppXrpc('/api/xrpc/app.ch.poltr.content.rating', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subject: { uri: subjectUri, cid: subjectCid },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to like: ${err}`);
  }

  const data = await res.json();
  return data.uri;
}

/**
 * Unlike a ballot. Routes through the appview which deletes from the PDS.
 */
export async function unlikeBallot(likeUri: string): Promise<void> {
  const res = await callAppXrpc('/api/xrpc/app.ch.poltr.content.unrating', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ likeUri }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to unlike: ${err}`);
  }
}

/**
 * Update a ballot record
 */
export async function updateBallot(
  rkey: string,
  ballot: Omit<BallotRecord, '$type' | 'createdAt'>
): Promise<{ uri: string; cid: string }> {
  // Add type
  const record: BallotRecord = {
    $type: 'app.ch.poltr.ballot.entry',
    ...ballot,
  };

  // Validate the record against the lexicon
  validateBallot(record);

  const agent = await getAuthenticatedAgent();

  const storedUser = localStorage.getItem('poltr_user');
  if (!storedUser) {
    throw new Error('No user in session');
  }
  const user = JSON.parse(storedUser);

  const response = await agent.com.atproto.repo.putRecord({
    repo: user.did,
    collection: 'app.ch.poltr.ballot.entry',
    rkey: rkey,
    record: record as unknown as Record<string, unknown>,
  });

  return {
    uri: response.data.uri,
    cid: response.data.cid,
  };
}
