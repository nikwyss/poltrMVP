import { toPdsError } from "./pdsError";

/**
 * Like a ballot. Routes through the appview which writes to the PDS.
 * Returns the URI of the created like record.
 */
export async function likeBallot(
  subjectUri: string,
  subjectCid: string
): Promise<string> {
  const res = await fetch('/api/xrpc/app.ch.poltr.content.rating', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subject: { uri: subjectUri, cid: subjectCid },
    }),
  });

  if (!res.ok) throw await toPdsError(res);

  const data = await res.json();
  return data.uri;
}

export const likeContent = likeBallot;

/**
 * Rate any content (argument, comment, …) on the canonical 0–100 preference
 * scale. Routes through the appview, which writes the rating into the user's
 * own PDS at a deterministic rkey — so re-rating overwrites in place.
 * Returns the URI of the rating record.
 */
export async function rateContent(
  subjectUri: string,
  subjectCid: string,
  preference: number
): Promise<string> {
  const res = await fetch('/api/xrpc/app.ch.poltr.content.rating', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subject: { uri: subjectUri, cid: subjectCid },
      preference,
    }),
  });

  if (!res.ok) throw await toPdsError(res);

  const data = await res.json();
  return data.uri;
}

/**
 * Unlike a ballot. Routes through the appview which deletes from the PDS.
 */
export async function unlikeBallot(likeUri: string): Promise<void> {
  const res = await fetch('/api/xrpc/app.ch.poltr.content.unrating', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ likeUri }),
  });

  if (!res.ok) throw await toPdsError(res);
}

export const unlikeContent = unlikeBallot;
