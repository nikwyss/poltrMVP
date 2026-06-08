
// TypeScript types for our lexicons
export type BallotType =
  | 'obligatorisches_referendum'
  | 'fakultatives_referendum'
  | 'volksinitiative'
  | 'direkter_gegenentwurf'
  | 'stichfrage';

/**
 * Ballot — flat REST shape (NOT an ATProto record).
 *
 * Source: services/appview/src/routes/ballots/ballots.py::_serialize_ballot
 *
 * Multilingual handling: text fields (title, description, topic) are returned
 * already localized to the requested language by the AppView. `originLanguage`
 * marks the source language, `availableLangs` lists which locales are filled
 * in. Use both to render "Original auf X" badges where appropriate.
 */
export interface Ballot {
  rkey: string;
  title: string;
  description?: string;
  topic?: string;
  ballotType?: BallotType;
  voteDate: string;
  officialRef?: string;
  originLanguage: string;
  langs: string[];
  availableLangs: string[];
  createdAt?: string;
  updatedAt?: string;
  /** Bridge to the deliberation layer: governance account DID for this ballot. */
  governanceDid?: string;
  argumentCount?: number;
  commentCount?: number;
  likeCount?: number;
  viewer?: { like?: string };
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
  /** Original languages of the record (BCP-47, Bluesky-compatible). */
  langs?: string[];
  /** Set when the title/body returned by AppView is a translation, not the original. */
  translatedFrom?: string;
  translationSource?: 'manual' | 'ai';
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
  peerreviewStatus?: 'preliminary' | 'approved' | 'rejected';
  indexedAt?: string;
  viewer?: {
    like?: string;
    // User's own rating on the canonical 0–100 preference scale (undefined = not rated).
    preference?: number;
  };
  /** Locales for which an original or translation exists (badges use this). */
  availableLangs?: string[];
  /** Same as record.translationSource — hoisted to make the UI lookup trivial. */
  translationSource?: 'manual' | 'ai';
  /**
   * Topic-Taxonomie-Breadcrumbs (app_topic_membership → app_topic_node): die
   * Pfade Wurzel→Knoten, an denen das Argument hängt (Wurzel ausgelassen). Ein
   * Argument kann zu mehreren Knoten gehören → mehrere Pfade. Pro Segment
   * `name` (+ `description` als Tooltip, `key` = Slug).
   */
  topicPaths?: { name: string; key?: string | null; description?: string | null }[][];
}

export interface CommentRecord {
  $type: 'app.ch.poltr.comment';
  title: string;
  body: string;
  argument: string;
  parent?: string;
  createdAt?: string;
  langs?: string[];
  translatedFrom?: string;
  translationSource?: 'manual' | 'ai';
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
  availableLangs?: string[];
  translationSource?: 'manual' | 'ai';
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
    peerreviewStatus?: string;
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

export interface PeerreviewCriterion {
  key: string;
  label: string;
}

export interface PeerreviewCriterionRating extends PeerreviewCriterion {
  rating: number;
}

export interface PeerreviewInvitation {
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

export interface PeerreviewResponse {
  reviewerDid: string;
  criteria: PeerreviewCriterionRating[];
  vote: 'APPROVE' | 'REJECT';
  justification?: string;
  createdAt: string;
}

export interface PeerreviewStatus {
  argumentUri: string;
  peerreviewStatus: 'preliminary' | 'approved' | 'rejected';
  governanceUri?: string;
  quorum: number;
  approvals: number;
  rejections: number;
  totalReviews: number;
  invitationCount: number;
  reviews?: PeerreviewResponse[];
}

// BallotWithMetadata removed — Ballots are now CMS REST content (flat shape),
// not ATProto records. Use `Ballot` directly.

// --- Taxonomy (top-down Themen-Hierarchie, app.ch.poltr.taxonomy.get) --------
/** Ein Argument, wie es in der Taxonomy-View je Knoten erscheint (Kurzform; das
 * volle Argument lädt das Overlay via argument.get). */
export interface TaxonomyArgument {
  uri: string;
  cid: string;
  rkey: string;
  title: string;
  type: 'PRO' | 'CONTRA';
  sourceType?: string;
  likeCount: number;
  /** Relevanz-Bewertung des Viewers (0–100) oder null/undefined. */
  viewerPreference?: number | null;
  availableLangs?: string[];
}

/** Ein Knoten des Themenbaums mit den direkt zugeordneten Argumenten. */
export interface TaxonomyNode {
  id: number;
  key?: string | null;
  name: string;
  /** Interne LLM-Klassifikations-Beschreibung (nicht voter-facing). */
  description?: string | null;
  /** Voter-facing Einleitung: warum das Thema zählt & für wen (Stimmbürgerschaft). */
  introduction?: string | null;
  depth: number;
  /** distinct Argumente im ganzen Teilbaum (für „X Argumente"). */
  argumentCount: number;
  /** Relevanz-gewichtete Pro-Vorlage-Neigung des Viewers ∈ [-1,1] (null = keine Bewertung). */
  proLeaning?: number | null;
  /** Dissens ∈ [0,1]: 1 = beide Pole gleich stark bewertet (gespalten). */
  dissent?: number;
  /** Wie viele Argumente im Teilbaum der Viewer bewertet hat. */
  ratedCount?: number;
  /** Argumente DIREKT an diesem Knoten (ein Argument kann an mehreren Knoten sein). */
  arguments: TaxonomyArgument[];
  children: TaxonomyNode[];
  /** Nur in der abgeflachten Topic-Sicht (Overlay): hatte der Knoten ursprünglich
   *  eigene Unterthemen? Steuert Drilldown vs. inline „Mehr anzeigen". */
  hasChildren?: boolean;
}

/** Ein Breadcrumb-Segment (Vorfahren-Pfad eines Topic-Knotens). */
export interface TaxonomyCrumb {
  name: string;
  key?: string | null;
  description?: string | null;
}

export interface TaxonomyTree {
  ballotRkey: string;
  tree: TaxonomyNode;
  /** Vorfahren-Pfad des Basis-Knotens (nur bei `topic`-Abruf; Wurzel + aktueller
   * Knoten ausgelassen) — fürs Hochnavigieren im Overlay. */
  breadcrumb?: TaxonomyCrumb[];
}
