import type { Ballot, ArgumentWithMetadata, CommentWithMetadata, ActivityItem, ReviewCriterion, ReviewInvitation, ReviewStatus, ReviewCriterionRating } from '../types/ballots';
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
    reviewStatus?: string;
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
): Promise<{ uri: string; cid: string }> {
  const authenticatedFetch = getAuthenticatedFetch();
  const payload: Record<string, string> = { argument: argumentUri, title, body };
  if (parentUri) payload.parent = parentUri;
  const res = await authenticatedFetch('/api/xrpc/app.ch.poltr.comment.create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await toPdsError(res);
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

export async function getReviewCriteria(): Promise<ReviewCriterion[]> {
  const authenticatedFetch = getAuthenticatedFetch();
  const res = await authenticatedFetch(`/api/xrpc/app.ch.poltr.review.criteria`);
  if (!res.ok) throw new Error(await res.text());
  const content = await res.json();
  return content.criteria;
}

export async function getPendingReviews(): Promise<ReviewInvitation[]> {
  const authenticatedFetch = getAuthenticatedFetch();
  const res = await authenticatedFetch(`/api/xrpc/app.ch.poltr.review.pending`);
  if (!res.ok) throw new Error(await res.text());
  const content = await res.json();
  return content.invitations;
}

export async function submitReview(
  argumentUri: string,
  criteria: ReviewCriterionRating[],
  vote: 'APPROVE' | 'REJECT',
  justification?: string,
): Promise<{ uri: string }> {
  const authenticatedFetch = getAuthenticatedFetch();
  const res = await authenticatedFetch(`/api/xrpc/app.ch.poltr.review.submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ argumentUri, criteria, vote, justification }),
  });
  if (!res.ok) throw await toPdsError(res);
  return res.json();
}

export async function getReviewStatus(argumentUri: string): Promise<ReviewStatus> {
  const authenticatedFetch = getAuthenticatedFetch();
  const res = await authenticatedFetch(
    `/api/xrpc/app.ch.poltr.review.status?argumentUri=${encodeURIComponent(argumentUri)}`
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
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
