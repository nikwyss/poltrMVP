import type { ProposalWithMetadata } from '../typing/proposals';
import { Agent } from '@atproto/api';

/**
 * Get authenticated fetch handler that includes session token
 * Cookies are sent automatically, but we can also check localStorage for fallback
 */
function getAuthenticatedFetch(): typeof fetch {
  return async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    
    // Cookies are sent automatically with credentials: 'include'
    // But provide Authorization header as fallback for API compatibility
    const sessionToken = localStorage.getItem('session_token');
    if (sessionToken) {
      headers.set('Authorization', `Bearer ${sessionToken}`);
    }

    return fetch(url, {
      ...init,
      headers,
      credentials: 'include', // Include cookies in request
    });
  };
}

/**
 * Get an authenticated AT Protocol agent
 */
export async function getAuthenticatedAgent(): Promise<Agent> {
  const { session, did } = await getAuthenticatedSession();

  return new Agent({
    get did() {
      return did as string;
    },
    fetchHandler(url: string, init: RequestInit) {
      return session.fetchHandler(url, init);
    },
  });
}

/**
 * Get authenticated session from localStorage
 */
export async function getAuthenticatedSession(): Promise<{ session: any; did: string }> {
  const stored = localStorage.getItem('poltr_user');

  if (!stored) {
    throw new Error('No authenticated session found. Please login.');
  }

  let user;
  try {
    user = JSON.parse(stored);
  } catch {
    throw new Error('Invalid user data in session');
  }

  // Create a mock session object with our custom fetch handler
  const session = {
    did: user.did,
    fetchHandler: getAuthenticatedFetch(),
  };

  return { session, did: user.did };
}

/**
 * Call an AppView xrpc endpoint (e.g. app.ch.poltr.vote.listProposals) using
 * the restored session's fetchHandler so the request is authenticated.
 */
export async function callAppXrpc(url: string, init: RequestInit = {}): Promise<Response> {
  const { session } = await getAuthenticatedSession();
  return session.fetchHandler(url, init as RequestInit);
}

/**
 * List records of a specific collection type
 */
export async function listRecords(
  repo: string,
  collection: string,
  limit: number = 100
): Promise<any> {
  console.log('Listing records for repo:', repo, 'collection:', collection);

  if (!repo.startsWith('did:plc:') && !repo.startsWith('did:web:')) {
    throw new Error(`Invalid DID format: ${repo}. Must start with 'did:plc:' or 'did:web:'`);
  }
  
  const agent = await getAuthenticatedAgent();
  const response = await agent.com.atproto.repo.listRecords({
    repo,
    collection,
    limit,
  });

  // Hydrate records
  const hydratedRecords = await Promise.all(
    response.data.records.map(async (record: any) => {
      try {
        const rkey = record.uri.split('/').pop();
        if (!rkey) {
          console.warn('Failed to extract rkey from URI:', record.uri);
          return record;
        }
        
        const hydrated = await agent.com.atproto.repo.getRecord({
          repo,
          collection,
          rkey,
        });
        
        console.log('Hydrated record:', hydrated, record) ;
        return hydrated.data;
      } catch (err) {
        console.warn('Failed to hydrate record:', record.uri, err);
        return record;
      }
    })
  );

  console.log(hydratedRecords);
  return { ...response.data, records: hydratedRecords };
}


export async function listProposalsAppView(_limit = 100): Promise<ProposalWithMetadata[]> {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const authenticatedFetch = getAuthenticatedFetch();
  
  const res = await authenticatedFetch(`${apiUrl}/xrpc/app.ch.poltr.vote.listProposals`);
  
  if (!res.ok) throw new Error(await res.text());
  const content = await res.json();
  console.log(content);
  if (!content?.proposals) {
    throw new Error('Invalid response from listProposals endpoint');
  }
  return content.proposals;
}

/**
 * Initiate E-ID verification process
 */
export async function initiateVerification(): Promise<{
  verification_id: string;
  verification_url: string;
  verification_deep_link: string;
  expires_at: string;
}> {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const authenticatedFetch = getAuthenticatedFetch();
  
  const res = await authenticatedFetch(`${apiUrl}/xrpc/app.ch.poltr.user.verification.initiate`);
  
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data;
}

/**
 * Poll verification status
 */
export async function pollVerification(verificationId: string): Promise<{
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'ERROR';
}> {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const authenticatedFetch = getAuthenticatedFetch();
  
  const res = await authenticatedFetch(
    `${apiUrl}/xrpc/app.ch.poltr.user.verification.polling?verification_id=${verificationId}`
  );
  
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data;
}
