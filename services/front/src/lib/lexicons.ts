import { Lexicons } from '@atproto/lexicon';

// Import lexicon schemas
import ballotLexicon from '../lexicons/app.ch.poltr.ballot.entry.json';
import embedLexicon from '../lexicons/app.ch.poltr.ballot.embed.json';
import type { BallotEmbed, BallotRecord } from '../types/ballots';

// Create a Lexicons instance with our custom schemas
export const lexicons = new Lexicons([
  ballotLexicon as any,
  embedLexicon as any,
]);


// Validation functions
export function validateBallot(data: any): BallotRecord {
  lexicons.assertValidRecord('app.ch.poltr.ballot.entry', data);
  return data as BallotRecord;
}

export function validateBallotEmbed(data: any): BallotEmbed {
  lexicons.assertValidXrpcParams('app.ch.poltr.ballot.embed', data);
  return data as BallotEmbed;
}

// Type guard functions
export function isBallotRecord(data: any): data is BallotRecord {
  return data?.$type === 'app.ch.poltr.ballot.entry';
}

export function isBallotEmbed(data: any): data is BallotEmbed {
  return data?.$type === 'app.ch.poltr.ballot.embed';
}
