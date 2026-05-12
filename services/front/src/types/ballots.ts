
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

export type ArgumentSource =
  | {
      $type: 'app.ch.poltr.ballot.argument#sourceUser';
      authorDid: string;
    }
  | {
      $type: 'app.ch.poltr.ballot.argument#sourceOfficial';
      documentRef?: string;
      section?: string;
    }
  | {
      $type: 'app.ch.poltr.ballot.argument#sourceOrganization';
      orgKey: string;
      documentRef?: string;
      verifiedDid?: string;
    };

export interface ArgumentRecord {
  $type: 'app.ch.poltr.ballot.argument';
  title: string;
  body: string;
  type: 'PRO' | 'CONTRA';
  ballot: string; // AT URI of the ballot
  createdAt?: string;
  source?: ArgumentSource;
}

export interface ArgumentWithMetadata {
  uri: string;
  cid: string;
  record: ArgumentRecord;
  // `author` is omitted for curated sources (official / organization).
  author?: {
    did: string;
    displayName?: string;
    canton?: string;
    color?: string;
  };
  likeCount?: number;
  commentCount?: number;
  reviewStatus?: 'preliminary' | 'approved' | 'rejected';
  indexedAt?: string;
  viewer?: {
    like?: string;
  };
}

export interface CommentRecord {
  $type: 'app.ch.poltr.comment';
  title: string;
  body: string;
  argument: string;
  parent?: string;
  createdAt?: string;
}

export interface CommentWithMetadata {
  uri: string;
  cid: string;
  record: CommentRecord;
  author: {
    did: string;
    displayName?: string;
    canton?: string;
    color?: string;
    handle?: string;
  };
  origin: 'intern' | 'extern';
  parentUri?: string;
  argumentUri: string;
  likeCount?: number;
  indexedAt?: string;
  viewer?: {
    like?: string;
  };
  replies?: CommentWithMetadata[];
}

export interface ActivityItem {
  type: 'comment' | 'reply' | 'new_argument' | 'milestone';
  activityUri: string;
  activityAt: string; // ISO timestamp
  actor: {
    did: string;
    displayName?: string;
    canton?: string;
    color?: string;
  };
  argument: {
    uri: string;
    rkey: string;
    title: string;
    body?: string;
    type?: 'PRO' | 'CONTRA';
    likeCount?: number;
    commentCount?: number;
    reviewStatus?: string;
  };
  comment?: {
    uri: string;
    text: string;
    likeCount?: number;
    replyCount?: number;
  };
  parent?: {
    uri: string;
    did: string;
    displayName?: string;
    text: string;
    hasParent?: boolean;
    likeCount?: number;
    replyCount?: number;
  };
  viewer?: {
    argumentLike?: string;
    seen?: boolean;
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
  argumentCount?: number;
  commentCount?: number;
  replyCount?: number;
  bookmarkCount?: number;
  labels?: string[];
  viewer?: {
    like?: string; // AT-URI of the viewer's like record
  };
}
