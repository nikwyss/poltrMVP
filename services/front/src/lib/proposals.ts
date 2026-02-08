import type { ProposalRecord } from '../types/proposals';
import { getAuthenticatedAgent } from './agent';
import { validateProposal } from './lexicons';


/**
 * Create a new proposal record
 */
export async function createProposal(
  proposal: Omit<ProposalRecord, '$type' | 'createdAt'>
): Promise<{ uri: string; cid: string }> {
  // Add type and timestamp
  const record: ProposalRecord = {
    $type: 'app.ch.poltr.vote.proposal',
    ...proposal,
    createdAt: new Date().toISOString(),
  };

  // Validate the record against the lexicon
  validateProposal(record);

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
    collection: 'app.ch.poltr.vote.proposal',
    record: record as unknown as Record<string, unknown>,
  });

  return {
    uri: response.data.uri,
    cid: response.data.cid,
  };
}

/**
 * Delete a proposal record
 */
export async function deleteProposal(rkey: string): Promise<void> {
  const agent = await getAuthenticatedAgent();

  const storedUser = localStorage.getItem('poltr_user');
  if (!storedUser) {
    throw new Error('No user in session');
  }
  const user = JSON.parse(storedUser);

  await agent.com.atproto.repo.deleteRecord({
    repo: user.did,
    collection: 'app.ch.poltr.vote.proposal',
    rkey: rkey,
  });
}

/**
 * Update a proposal record
 */
export async function updateProposal(
  rkey: string,
  proposal: Omit<ProposalRecord, '$type' | 'createdAt'>
): Promise<{ uri: string; cid: string }> {
  // Add type
  const record: ProposalRecord = {
    $type: 'app.ch.poltr.vote.proposal',
    ...proposal,
  };

  // Validate the record against the lexicon
  validateProposal(record);

  const agent = await getAuthenticatedAgent();

  const storedUser = localStorage.getItem('poltr_user');
  if (!storedUser) {
    throw new Error('No user in session');
  }
  const user = JSON.parse(storedUser);

  const response = await agent.com.atproto.repo.putRecord({
    repo: user.did,
    collection: 'app.ch.poltr.vote.proposal',
    rkey: rkey,
    record: record as unknown as Record<string, unknown>,
  });

  return {
    uri: response.data.uri,
    cid: response.data.cid,
  };
}
