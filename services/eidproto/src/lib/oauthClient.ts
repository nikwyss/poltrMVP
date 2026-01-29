import { BrowserOAuthClient } from '@atproto/oauth-client-browser';

let oauthClient: BrowserOAuthClient | null = null;

export async function getOAuthClient(): Promise<BrowserOAuthClient> {
  if (oauthClient) {
    return oauthClient;
  }

  const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI || 'http://127.0.0.1:3001/callback';
  const clientIdBase = process.env.NEXT_PUBLIC_CLIENT_ID_BASE || 'http://localhost';
  const scope = 'atproto transition:generic';

  // Loopback clients (localhost/127.0.0.1) use query params, production uses path to metadata
  const isLoopback = clientIdBase.includes('localhost') || clientIdBase.includes('127.0.0.1');
  const clientId = isLoopback
    ? `${clientIdBase}?redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`
    : `${clientIdBase}/client-metadata.json`;

  const handleResolver = process.env.NEXT_PUBLIC_HANDLE_RESOLVER;

  oauthClient = await BrowserOAuthClient.load({
    clientId: clientId,
    handleResolver: handleResolver || 'https://bsky.social',
  });

  return oauthClient;
}

export async function startLogin(handle: string): Promise<void> {
  const client = await getOAuthClient();
  await client.signIn(handle, {
    signal: new AbortController().signal,
  });
}
