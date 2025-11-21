type SortMode = 'newest' | 'vote_date' | 'topic' | 'popularity';

export interface CursorPayload {
  sort: SortMode;
  p: string; // primary key (date, topic, popularity) as string
  r: string; // rkey
}


export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorPayload {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
}
