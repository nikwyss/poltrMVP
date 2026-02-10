import type { BallotRecord } from '../types/ballots';
import { getAuthenticatedAgent } from './agent';
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

  // Create the record
  const response = await agent.com.atproto.repo.createRecord({
    repo: user.did,
    collection: 'app.ch.poltr.ballot.entry',
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
