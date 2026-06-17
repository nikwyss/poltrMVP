import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function joinURIBaseAndPath(base: string, path: string): string {
  const baseURL = new URL(base);
  if (!path.startsWith('/')) {
    path = '/' + path;
  }
  baseURL.pathname = path;
  return baseURL.toString();
}

export async function readAllStreamWithLimit(
  stream: ReadableStream<Uint8Array>,
  limit: number
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalLength += value.length;
      if (totalLength > limit) {
        throw new Error('Stream exceeded size limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export const formatRelativeTime = (isoDate: string): string => {
  try {
    const now = Date.now();
    const then = new Date(isoDate).getTime();
    const diffSec = Math.floor((now - then) / 1000);
    if (diffSec < 60) return 'jetzt';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 30) return `${diffD}d`;
    return formatDate(isoDate);
  } catch {
    return isoDate;
  }
};

export const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('de-CH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return dateStr;
  }
};
