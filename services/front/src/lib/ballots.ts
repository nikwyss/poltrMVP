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

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to like: ${err}`);
  }

  const data = await res.json();
  return data.uri;
}

export const likeContent = likeBallot;

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

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to unlike: ${err}`);
  }
}

export const unlikeContent = unlikeBallot;
