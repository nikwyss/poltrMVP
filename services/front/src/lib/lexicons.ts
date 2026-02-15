import { Lexicons } from '@atproto/lexicon';

// Import lexicon schemas
import ballotLexicon from '../lexicons/app.ch.poltr.ballot.entry.json';
import type { BallotRecord } from '../types/ballots';

// Create a Lexicons instance with our custom schemas
export const lexicons = new Lexicons([
  ballotLexicon as any,
]);


// Validation functions
export function validateBallot(data: any): BallotRecord {
  lexicons.assertValidRecord('app.ch.poltr.ballot.entry', data);
  return data as BallotRecord;
}

// Type guard functions
export function isBallotRecord(data: any): data is BallotRecord {
  return data?.$type === 'app.ch.poltr.ballot.entry';
}
