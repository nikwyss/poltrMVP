import { BrowserOAuthClient } from '@atproto/oauth-client-browser';

let oauthClient: BrowserOAuthClient | null = null;

export async function getOAuthClient(): Promise<BrowserOAuthClient> {
  if (oauthClient) {
    return oauthClient;
  }

  // Get OAuth configuration from environment variables
  const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI || 'http://127.0.0.1:5173/callback';
  const clientIdBase = process.env.NEXT_PUBLIC_CLIENT_ID_BASE || 'http://127.0.0.1:5173';
  const scope = 'atproto transition:generic';

  // Loopback clients (localhost/127.0.0.1) use query params, production uses path to metadata
  const isLoopback = clientIdBase.includes('localhost') || clientIdBase.includes('127.0.0.1');
  const clientId = isLoopback
    ? `${clientIdBase}?redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`
    : `${clientIdBase}/client-metadata.json`;

  // Optional: Use custom handle resolver for fully isolated environments
  // If not set, defaults to public resolvers (plc.directory, DNS)
  const handleResolver = process.env.NEXT_PUBLIC_HANDLE_RESOLVER;

  oauthClient = await BrowserOAuthClient.load({
    clientId: clientId,
    // Use bsky.social as the handle resolver (or custom resolver if configured)
    // This resolves handles to DIDs and works with the entire ATProto federation
    handleResolver: handleResolver || process.env.NEXT_PUBLIC_PDS_URL || 'https://bsky.social',
  });

  return oauthClient;
}

export async function initOAuthSession() {
  const client = await getOAuthClient();

  // Try to restore existing session
  try {
    const session = await client.restore(window.location.origin);
    if (session) {
      return session;
    }
  } catch (err) {
    console.log('No existing session');
  }

  return null;
}
