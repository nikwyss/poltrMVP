import type { Ballot, ArgumentWithMetadata, CommentWithMetadata, ActivityItem, PeerreviewCriterion, PeerreviewInvitation, PeerreviewStatus, PeerreviewCriterionRating, PeerreviewListItem, TaxonomyTree, DuplicateCandidate, PeerreviewState } from '../types/ballots';
import type { BallotSearchResponse } from '../types/search';
import { toPdsError } from './pdsError';

/**
 * Get authenticated fetch handler that routes through Next.js API proxy.
 * The session cookie is sent automatically and forwarded as Bearer token by the proxy.
 * On 401 responses, dispatches a 'poltr:session-expired' event so the UI can react.
 */
function getAuthenticatedFetch(): typeof fetch {
  return async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const res = await fetch(url, {
      ...init,
      credentials: 'include',
    });

    if (res.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('poltr:session-expired'));
    }

    return res;
  };
}

// ---------------------------------------------------------------------------
// Ballot API
// ---------------------------------------------------------------------------

/**
 * Ballots use the REST `/api/poltr/ballots*` proxy (basis-app layer).
 * Pseudo-XRPC URLs are gone — Ballots are CMS content, not ATProto records.
 * `lang` defaults to the cookie-resolved locale on the server side; pass
 * explicitly to override (e.g. preview).
 */
export async function getBallot(rkey: string, lang?: string): Promise<Ballot> {
  const authenticatedFetch = getAuthenticatedFetch();
  const qs = lang ? `?lang=${encodeURIComponent(lang)}` : '';
  const res = await authenticatedFetch(`/api/poltr/ballots/${encodeURIComponent(rkey)}${qs}`);
  if (!res.ok) throw new Error(await res.text());
  const content = await res.json();
  if (!content?.ballot) {
    throw new Error('Invalid response from /api/poltr/ballots/<rkey>');
  }
  return content.ballot;
}

export async function listBallots(lang?: string): Promise<Ballot[]> {
  const authenticatedFetch = getAuthenticatedFetch();
  const qs = lang ? `?lang=${encodeURIComponent(lang)}` : '';
  const res = await authenticatedFetch(`/api/poltr/ballots${qs}`);
  if (!res.ok) throw new Error(await res.text());
  const content = await res.json();
  if (!content?.ballots) {
    throw new Error('Invalid response from /api/poltr/ballots');
  }
  return content.ballots;
}

// ---------------------------------------------------------------------------
// Argument API
// ---------------------------------------------------------------------------

export async function getArgument(
  ballotRkey: string,
  rkey: string,
): Promise<ArgumentWithMetadata> {
  const authenticatedFetch = getAuthenticatedFetch();
  const params = new URLSearchParams({
    ballot_rkey: ballotRkey,
    rkey,
  });
  const res = await authenticatedFetch(
    `/api/xrpc/app.ch.poltr.argument.get?${params.toString()}`,
  );
  if (!res.ok) throw new Error(await res.text());
  const content = await res.json();
  if (!content?.argument) {
    throw new Error('Invalid response from argument.get endpoint');
  }
  return content.argument;
}

export async function listArguments(
  ballotRkey: string,
  sort?: string,
  type?: string,
  source?: 'user' | 'official' | 'organization' | 'all',
): Promise<ArgumentWithMetadata[]> {
  const authenticatedFetch = getAuthenticatedFetch();
  const params = new URLSearchParams({ ballot_rkey: ballotRkey });
  if (sort) params.set('sort', sort);
  if (type) params.set('type', type);
  if (source && source !== 'all') params.set('source', source);
  const res = await authenticatedFetch(`/api/xrpc/app.ch.poltr.argument.list?${params.toString()}`);
  if (!res.ok) throw new Error(await res.text());
  const content = await res.json();
  if (!content?.arguments) {
    throw new Error('Invalid response from argument.list endpoint');
  }
  return content.arguments;
}

export async function getTaxonomy(
  ballotRkey: string,
  lang?: string,
  topic?: string,
  // 'full' = voller verschachtelter Baum (Sunburst); sonst Basis + 1 flache Ebene.
  shape?: 'full',
): Promise<TaxonomyTree | null> {
  const authenticatedFetch = getAuthenticatedFetch();
  const params = new URLSearchParams({ ballot_rkey: ballotRkey });
  if (lang) params.set('lang', lang);
  if (topic) params.set('topic', topic);
  if (shape) params.set('shape', shape);
  const res = await authenticatedFetch(
    `/api/xrpc/app.ch.poltr.taxonomy.get?${params.toString()}`,
  );
  if (res.status === 404) return null; // noch keine Taxonomie für diesen Ballot
  if (!res.ok) throw new Error(await res.text());
  const content = await res.json();
  if (!content?.tree) throw new Error('Invalid response from taxonomy.get endpoint');
  return content as TaxonomyTree;
}

export async function createArgument(
  ballotRkey: string,
  title: string,
  body: string,
  type: 'PRO' | 'CONTRA',
  langs?: string[],
): Promise<{ uri: string; cid: string }> {
  const authenticatedFetch = getAuthenticatedFetch();
  const payload: Record<string, unknown> = { ballot: ballotRkey, title, body, type };
  if (langs && langs.length) payload.langs = langs;
  const res = await authenticatedFetch('/api/xrpc/app.ch.poltr.argument.create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await toPdsError(res);
  return res.json();
}

export type SimilarArgument = {
  uri: string;
  title: string;
  body: string;
  type: 'PRO' | 'CONTRA';
  similarity: number;
};

// Pro Check ein Status, damit „wirklich kein Befund" (ok) von
// „Prüfung fehlgeschlagen/nicht erreichbar" (unavailable) unterscheidbar ist.
export type DuplicatesCheck = {
  status: 'ok' | 'unavailable';
  items: SimilarArgument[];
};

// Stance-/Kohärenz-Check (LLM, konservativ). severity: 'ok' (stimmig) |
// 'hint' (kleiner Hinweis) | 'warn' (klarer Stance-Mismatch).
export type StanceCheck = {
  status: 'ok' | 'unavailable';
  severity?: 'ok' | 'hint' | 'warn';
  reads_as?: 'pro' | 'contra' | 'unclear';
  matches_selected?: boolean;
  is_argument?: boolean;
  on_topic?: boolean;
  feedback?: string;
};

// Thematik-Check (Variante B): On-Topic + zugeordnetes Hauptthema (LLM).
// choice = Themenname | 'ANDERES' (kein passendes Thema) | null (keine Taxonomie).
export type TopicCheck = {
  status: 'ok' | 'unavailable';
  severity?: 'ok' | 'warn';
  on_topic?: boolean | null;
  choice?: string | null;
};

// Umgangston (LLM, konservativ): 'warn' bei Beschimpfungen/Vulgaritäten.
export type ToneCheck = {
  status: 'ok' | 'unavailable';
  severity?: 'ok' | 'warn';
};

// Fokus / Unity of Thought (LLM, konservativ): 'warn', wenn der Text mehrere
// eigenständige Argumente bündelt (Sammelsurium) statt eines Gedankens.
export type UnityCheck = {
  status: 'ok' | 'unavailable';
  severity?: 'ok' | 'warn';
};

export type ArgumentPrecheck = {
  duplicates: DuplicatesCheck;
  stance: StanceCheck;
  topic: TopicCheck;
  tone: ToneCheck;
  unity: UnityCheck;
};

const DUP_UNAVAILABLE: DuplicatesCheck = { status: 'unavailable', items: [] };
const STANCE_UNAVAILABLE: StanceCheck = { status: 'unavailable' };
const TOPIC_UNAVAILABLE: TopicCheck = { status: 'unavailable' };
const TONE_UNAVAILABLE: ToneCheck = { status: 'unavailable' };
const UNITY_UNAVAILABLE: UnityCheck = { status: 'unavailable' };

/**
 * Prüfstufe vor dem Erstellen: liefert ein erweiterbares Bündel von Checks
 * (Duplikate via Embeddings + Stance/Kohärenz via LLM). Nicht-blockierend —
 * schlägt ein Check fehl, kommt `status:'unavailable'`, damit das UI ehrlich
 * „nicht verfügbar" zeigt statt eines falschen „alles ok".
 */
export async function precheckArgument(
  ballotRkey: string,
  title: string,
  body: string,
  type: 'PRO' | 'CONTRA',
): Promise<ArgumentPrecheck> {
  const authenticatedFetch = getAuthenticatedFetch();
  try {
    const res = await authenticatedFetch('/api/xrpc/app.ch.poltr.argument.precheck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ballot: ballotRkey, title, body, type }),
    });
    if (!res.ok)
      return {
        duplicates: DUP_UNAVAILABLE,
        stance: STANCE_UNAVAILABLE,
        topic: TOPIC_UNAVAILABLE,
        tone: TONE_UNAVAILABLE,
        unity: UNITY_UNAVAILABLE,
      };
    const content = await res.json();
    const dup = content?.duplicates;
    const st = content?.stance;
    const tp = content?.topic;
    const tn = content?.tone;
    const un = content?.unity;
    return {
      duplicates:
        dup && typeof dup === 'object' && 'status' in dup
          ? { status: dup.status, items: dup.items ?? [] }
          : DUP_UNAVAILABLE,
      stance:
        st && typeof st === 'object' && 'status' in st
          ? (st as StanceCheck)
          : STANCE_UNAVAILABLE,
      topic:
        tp && typeof tp === 'object' && 'status' in tp
          ? (tp as TopicCheck)
          : TOPIC_UNAVAILABLE,
      tone:
        tn && typeof tn === 'object' && 'status' in tn
          ? (tn as ToneCheck)
          : TONE_UNAVAILABLE,
      unity:
        un && typeof un === 'object' && 'status' in un
          ? (un as UnityCheck)
          : UNITY_UNAVAILABLE,
    };
  } catch {
    return {
      duplicates: DUP_UNAVAILABLE,
      stance: STANCE_UNAVAILABLE,
      topic: TOPIC_UNAVAILABLE,
      tone: TONE_UNAVAILABLE,
      unity: UNITY_UNAVAILABLE,
    };
  }
}

// ---------------------------------------------------------------------------
// Comment API
// ---------------------------------------------------------------------------

export async function getComment(uri: string): Promise<{
  comment: CommentWithMetadata;
  argument: {
    uri: string;
    rkey: string;
    title: string;
    body?: string;
    type?: 'PRO' | 'CONTRA';
    likeCount?: number;
    commentCount?: number;
    peerreviewStatus?: string;
    ballotRkey: string;
  };
}> {
  const authenticatedFetch = getAuthenticatedFetch();
  const res = await authenticatedFetch(
    `/api/xrpc/app.ch.poltr.comment.get?uri=${encodeURIComponent(uri)}`
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listComments(argumentUri: string): Promise<CommentWithMetadata[]> {
  const authenticatedFetch = getAuthenticatedFetch();
  const res = await authenticatedFetch(
    `/api/xrpc/app.ch.poltr.comment.list?argument_uri=${encodeURIComponent(argumentUri)}`
  );
  if (!res.ok) throw new Error(await res.text());
  const content = await res.json();
  return content.comments ?? [];
}

export async function createComment(
  argumentUri: string,
  title: string,
  body: string,
  parentUri?: string,
  langs?: string[],
): Promise<{ uri: string; cid: string }> {
  const authenticatedFetch = getAuthenticatedFetch();
  const payload: Record<string, unknown> = { argument: argumentUri, title, body };
  if (parentUri) payload.parent = parentUri;
  if (langs && langs.length) payload.langs = langs;
  const res = await authenticatedFetch('/api/xrpc/app.ch.poltr.comment.create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await toPdsError(res);
  return res.json();
}

// ---------------------------------------------------------------------------
// Search API
// ---------------------------------------------------------------------------

// Ballot-wide search over taxonomy nodes, arguments and comments, restricted to
// the given ballot and language. `lang` should be passed explicitly so it stays
// in sync with the query key (the proxy would otherwise fall back to the cookie).
export async function searchBallot(
  ballotRkey: string,
  q: string,
  lang?: string,
  type?: 'taxonomy' | 'argument' | 'comment',
): Promise<BallotSearchResponse> {
  const authenticatedFetch = getAuthenticatedFetch();
  const params = new URLSearchParams({ ballot_rkey: ballotRkey, q });
  if (lang) params.set('lang', lang);
  if (type) params.set('type', type);
  const res = await authenticatedFetch(
    `/api/xrpc/app.ch.poltr.ballot.search?${params.toString()}`,
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ---------------------------------------------------------------------------
// Activity API
// ---------------------------------------------------------------------------

export async function listActivity(
  ballotRkey: string,
  filter?: 'all' | 'comments' | 'arguments',
  cursor?: string,
  limit = 30,
): Promise<{ activities: ActivityItem[]; cursor?: string }> {
  const authenticatedFetch = getAuthenticatedFetch();
  const params = new URLSearchParams({ ballot_rkey: ballotRkey, limit: String(limit) });
  if (filter && filter !== 'all') params.set('filter', filter);
  if (cursor) params.set('cursor', cursor);
  const res = await authenticatedFetch(`/api/xrpc/app.ch.poltr.activity.list?${params.toString()}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function markActivitySeen(uris: string[]): Promise<void> {
  if (uris.length === 0) return;
  const authenticatedFetch = getAuthenticatedFetch();
  await authenticatedFetch('/api/xrpc/app.ch.poltr.activity.markSeen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris }),
  });
}

// ---------------------------------------------------------------------------
// Peer-review API
// ---------------------------------------------------------------------------

export async function getPeerreviewCriteria(): Promise<PeerreviewCriterion[]> {
  const authenticatedFetch = getAuthenticatedFetch();
  const res = await authenticatedFetch(`/api/xrpc/app.ch.poltr.peerreview.criteria`);
  if (!res.ok) throw new Error(await res.text());
  const content = await res.json();
  return content.criteria;
}

export async function getPendingPeerreviews(): Promise<PeerreviewInvitation[]> {
  const authenticatedFetch = getAuthenticatedFetch();
  const res = await authenticatedFetch(`/api/xrpc/app.ch.poltr.peerreview.pending`);
  if (!res.ok) throw new Error(await res.text());
  const content = await res.json();
  return content.invitations;
}

export async function submitPeerreview(
  argumentUri: string,
  criteria: PeerreviewCriterionRating[],
  vote: 'APPROVE' | 'REJECT',
): Promise<{ uri: string }> {
  const authenticatedFetch = getAuthenticatedFetch();
  const res = await authenticatedFetch(`/api/xrpc/app.ch.poltr.peerreview.submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ argumentUri, criteria, vote }),
  });
  if (!res.ok) throw await toPdsError(res);
  return res.json();
}

export async function getPeerreviewStatus(argumentUri: string): Promise<PeerreviewStatus> {
  const authenticatedFetch = getAuthenticatedFetch();
  const res = await authenticatedFetch(
    `/api/xrpc/app.ch.poltr.peerreview.status?argumentUri=${encodeURIComponent(argumentUri)}`
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Live-Duplikat-Check fürs Reviewer-Overlay (frisch berechnet, kein persistierter
// Befund). Graceful: bei Calculator-Ausfall liefert der Server {status:'unavailable'}.
export async function getDuplicateCandidate(
  argumentUri: string,
): Promise<{ status: 'ok' | 'unavailable'; items: DuplicateCandidate[] }> {
  const authenticatedFetch = getAuthenticatedFetch();
  try {
    const res = await authenticatedFetch(
      `/api/xrpc/app.ch.poltr.peerreview.duplicateCandidate?argumentUri=${encodeURIComponent(argumentUri)}`
    );
    if (!res.ok) return { status: 'unavailable', items: [] };
    const content = await res.json();
    return { status: content.status ?? 'unavailable', items: content.items ?? [] };
  } catch {
    return { status: 'unavailable', items: [] };
  }
}

// Check-in: claim a review slot (required before submit) and learn the lifecycle
// state + grace deadline. Non-throwing → discriminated result for clean gating.
export type CheckInResult =
  | { ok: true; state: PeerreviewState; quorum: number; graceUntil: string | null }
  | { ok: false; error: 'closed' | 'too_late' | 'not_invited' | 'not_found' | 'unknown' };

export async function checkInPeerreview(argumentUri: string): Promise<CheckInResult> {
  const authenticatedFetch = getAuthenticatedFetch();
  try {
    const res = await authenticatedFetch(`/api/xrpc/app.ch.poltr.peerreview.checkIn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ argumentUri }),
    });
    const content = await res.json().catch(() => ({}));
    if (res.ok) {
      return { ok: true, state: content.state, quorum: content.quorum, graceUntil: content.graceUntil ?? null };
    }
    const err = content.error;
    return { ok: false, error: ['closed', 'too_late', 'not_invited', 'not_found'].includes(err) ? err : 'unknown' };
  } catch {
    return { ok: false, error: 'unknown' };
  }
}

// Activity ping: slide the grace window forward while the reviewer is typing
// (throttled by the caller). Returns the refreshed deadline, or null on any error
// (never throws — a missed ping is harmless).
export async function peerreviewActivity(
  argumentUri: string,
): Promise<{ state: PeerreviewState; graceUntil: string | null } | null> {
  const authenticatedFetch = getAuthenticatedFetch();
  try {
    const res = await authenticatedFetch(`/api/xrpc/app.ch.poltr.peerreview.activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ argumentUri }),
    });
    if (!res.ok) return null;
    const content = await res.json();
    return { state: content.state, graceUntil: content.graceUntil ?? null };
  } catch {
    return null;
  }
}

// Per-ballot Gutachten list. scope='mine' (default) = reviews the viewer is
// involved in; scope='all' = every peer review of the ballot.
export async function listPeerreviews(
  ballotRkey: string,
  scope: 'mine' | 'all' = 'mine',
): Promise<PeerreviewListItem[]> {
  const authenticatedFetch = getAuthenticatedFetch();
  const res = await authenticatedFetch(
    `/api/xrpc/app.ch.poltr.peerreview.list?ballotRkey=${encodeURIComponent(ballotRkey)}&scope=${scope}`
  );
  if (!res.ok) throw new Error(await res.text());
  const content = await res.json();
  return content.reviews;
}

// ---------------------------------------------------------------------------
// Auth-related API (optional features)
// ---------------------------------------------------------------------------

export async function createAppPassword(): Promise<{
  name: string;
  password: string;
  createdAt: string;
}> {
  const authenticatedFetch = getAuthenticatedFetch();
  const res = await authenticatedFetch(`/api/xrpc/ch.poltr.auth.createAppPassword`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function initiateEidVerification(): Promise<{
  redirect_url: string;
}> {
  const authenticatedFetch = getAuthenticatedFetch();
  const res = await authenticatedFetch(`/api/xrpc/ch.poltr.auth.initiateEidVerification`, {
    method: 'POST',
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || 'Failed to initiate verification');
  }
  return res.json();
}
