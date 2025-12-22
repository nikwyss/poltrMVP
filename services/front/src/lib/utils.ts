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
