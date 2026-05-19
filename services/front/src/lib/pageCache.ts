"use client";

const TTL_MS = 60_000;

type Entry = { data: unknown; fetchedAt: number };
const cache = new Map<string, Entry>();

/**
 * Returns cached data if still fresh; otherwise calls `fetcher` and stores
 * the result. Used to skip refetching on quick back-navigation so the page
 * renders at the exact same height it had before navigating away, which is
 * what makes pixel-based scroll restoration land correctly.
 */
export async function loadCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = TTL_MS,
): Promise<T> {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.fetchedAt < ttlMs) {
    return entry.data as T;
  }
  const data = await fetcher();
  cache.set(key, { data, fetchedAt: Date.now() });
  return data;
}

/** Mutate the cached value in place — keeps the original `fetchedAt`. */
export function patchCached<T>(
  key: string,
  patcher: (current: T) => T,
): void {
  const entry = cache.get(key);
  if (!entry) return;
  cache.set(key, {
    data: patcher(entry.data as T),
    fetchedAt: entry.fetchedAt,
  });
}

export function invalidateCached(keyOrPrefix?: string): void {
  if (!keyOrPrefix) {
    cache.clear();
    return;
  }
  if (cache.has(keyOrPrefix)) {
    cache.delete(keyOrPrefix);
    return;
  }
  for (const k of cache.keys()) {
    if (k.startsWith(keyOrPrefix)) cache.delete(k);
  }
}
