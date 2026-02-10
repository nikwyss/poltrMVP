
// TypeScript types for our lexicons
export interface BallotRecord {
  $type: 'app.ch.poltr.ballot.entry';
  title: string;
  topic?: string;
  text?: string;
  officialRef?: string;
  voteDate: string; // ISO date string
  language?: 'de-CH' | 'fr-CH' | 'it-CH' | 'rm-CH';
  createdAt?: string;
}

export interface BallotEmbed {
  $type: 'app.ch.poltr.ballot.embed';
  ballot: BallotView;
}

export interface BallotView {
  uri: string; // at-uri format
  cid: string;
  title: string;
  topic?: string;
  voteDate: string;
  language?: 'de-CH' | 'fr-CH' | 'it-CH' | 'rm-CH';
}


export interface BallotWithMetadata {
  uri: string;
  cid: string;
  record: BallotRecord;
  author?: {
    did: string;
    labels: string[];
  };
  indexedAt?: string;
  likeCount?: number;
  replyCount?: number;
  bookmarkCount?: number;
  labels?: string[];
  liked?: boolean;
}
