
// TypeScript types for our lexicons
export interface BallotRecord {
  $type: 'app.ch.poltr.ballot.entry';
  title: string;
  topic?: string;
  text?: string;
  officialRef: string;
  voteDate: string; // ISO date string
  language?: 'de-CH' | 'fr-CH' | 'it-CH' | 'rm-CH';
  createdAt?: string;
}

export interface ArgumentRecord {
  $type: 'app.ch.poltr.ballot.argument';
  title: string;
  body: string;
  type: 'PRO' | 'CONTRA';
  ballot: string; // AT URI of the ballot
  createdAt?: string;
}

export interface ArgumentWithMetadata {
  uri: string;
  cid: string;
  record: ArgumentRecord;
  author: {
    did: string;
  };
  likeCount?: number;
  commentCount?: number;
  reviewStatus?: 'preliminary' | 'approved' | 'rejected';
  indexedAt?: string;
  viewer?: {
    like?: string;
  };
}

export interface ReviewCriterion {
  key: string;
  label: string;
}

export interface ReviewCriterionRating extends ReviewCriterion {
  rating: number;
}

export interface ReviewInvitation {
  invitationUri: string;
  argumentUri: string;
  invitedAt: string;
  argument: {
    title: string;
    body: string;
    type: 'PRO' | 'CONTRA';
    ballotUri: string;
    ballotRkey: string;
    authorDid: string;
  };
}

export interface ReviewResponse {
  reviewerDid: string;
  criteria: ReviewCriterionRating[];
  vote: 'APPROVE' | 'REJECT';
  justification?: string;
  createdAt: string;
}

export interface ReviewStatus {
  argumentUri: string;
  reviewStatus: 'preliminary' | 'approved' | 'rejected';
  governanceUri?: string;
  quorum: number;
  approvals: number;
  rejections: number;
  totalReviews: number;
  invitationCount: number;
  reviews?: ReviewResponse[];
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
  viewer?: {
    like?: string; // AT-URI of the viewer's like record
  };
}
