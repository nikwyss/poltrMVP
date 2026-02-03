
// TypeScript types for our lexicons
export interface ProposalRecord {
  $type: 'app.ch.poltr.vote.proposal';
  title: string;
  topic?: string;
  text?: string;
  officialRef?: string;
  voteDate: string; // ISO date string
  language?: 'de-CH' | 'fr-CH' | 'it-CH' | 'rm-CH';
  createdAt?: string;
}

export interface ProposalEmbed {
  $type: 'app.ch.poltr.vote.embed';
  proposal: ProposalView;
}

export interface ProposalView {
  uri: string; // at-uri format
  cid: string;
  title: string;
  topic?: string;
  voteDate: string;
  language?: 'de-CH' | 'fr-CH' | 'it-CH' | 'rm-CH';
}


export interface ProposalWithMetadata {
  uri: string;
  cid: string;
  record: ProposalRecord;
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

