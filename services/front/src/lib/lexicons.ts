import { Lexicons } from '@atproto/lexicon';

// Import lexicon schemas
import proposalLexicon from '../lexicons/app.ch.poltr.vote.proposal.json';
import embedLexicon from '../lexicons/app.ch.poltr.vote.embed.json';
import type { ProposalEmbed, ProposalRecord } from '../typing/proposals';

// Create a Lexicons instance with our custom schemas
export const lexicons = new Lexicons([
  proposalLexicon as any,
  embedLexicon as any,
]);


// Validation functions
export function validateProposal(data: any): ProposalRecord {
  lexicons.assertValidRecord('app.ch.poltr.vote.proposal', data);
  return data as ProposalRecord;
}

export function validateProposalEmbed(data: any): ProposalEmbed {
  lexicons.assertValidXrpcParams('app.ch.poltr.vote.embed', data);
  return data as ProposalEmbed;
}

// Type guard functions
export function isProposalRecord(data: any): data is ProposalRecord {
  return data?.$type === 'app.ch.poltr.vote.proposal';
}

export function isProposalEmbed(data: any): data is ProposalEmbed {
  return data?.$type === 'app.ch.poltr.vote.embed';
}
