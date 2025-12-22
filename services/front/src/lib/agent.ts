import type { ProposalWithMetadata } from '../typing/proposals';
import { getOAuthClient } from './oauthClient';
import { Agent } from '@atproto/api';

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
 * Restore and return the OAuth session and DID.
 * Use this when you need direct access to the session (for arbitrary fetches)
 */
export async function getAuthenticatedSession(): Promise<{ session: any; did: string }> {
  const client = await getOAuthClient();
  const stored = localStorage.getItem('poltr_user');
  let did: string | undefined;
  if (stored) {
    try {
      const u = JSON.parse(stored);
      did = u.did;
    } catch {
      // ignore parse errors; we’ll fall back to restore
    }
  }

  // Restore the OAuth session from IndexedDB.
  // Only call restore(did) if did is defined; otherwise use origin as audience.
  let session: any = null;
  try {
    if (did) {
      session = await client.restore(did);
    } else {
      session = await client.restore(window.location.origin);
    }
  } catch {
    // optional secondary attempt (useful if audience mismatch)
    try {
      session = await client.restore(window.location.origin);
    } catch {
      session = null;
    }
  }

  if (!session) {
    throw new Error('No authenticated session found. Please login.');
  }

  // Derive DID from session if not present in local snapshot
  did = session.did || did;
  if (!did) {
    throw new Error('No DID available in session');
  }

  return { session, did };
}

/**
 * Call an AppView xrpc endpoint (e.g. app.ch.poltr.vote.listProposals) using
 * the restored session's fetchHandler so the request is authenticated.
 * Example usage:
 *   const res = await callAppXrpc('http://localhost:3000/xrpc/app.ch.poltr.vote.listProposals', { method: 'POST', body: JSON.stringify({}) });
 */
export async function callAppXrpc(url: string, init: RequestInit = {}): Promise<Response> {
  const { session } = await getAuthenticatedSession();
  // session.fetchHandler behaves like window.fetch but injects auth for the session's audience
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
        // console.log('Hydrating record:', record);
        // Extract rkey from the URI (last segment after the last '/')
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

        // Fetch likes for this record
        // const likes = await agent.app.bsky.feed.getLikes({
        //   uri: record.uri,
        //   limit: 100,
        // });
        // hydrated.data.likes = likes.data;
        // hydrated.data.liked = likes.data.likes.some((like: any) => like.actor.did === agent.did);
        
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

  // return response.data;
}


export async function listProposalsAppView(_limit = 100): Promise<ProposalWithMetadata[]> {
  const res = await callAppXrpc('http://localhost:3000/xrpc/app.ch.poltr.vote.listProposals')
  // , {
  //   method: 'GET',
    // headers: { 'Content-Type': 'application/json' },
    // body: JSON.stringify({ }),
  // });
  if (!res.ok) throw new Error(await res.text());
  const content = await res.json();
  console.log(content);
  if (!content?.proposals) {
    throw new Error('Invalid response from listProposals endpoint');
  }
  return content.proposals;
}





// export const listFeed = async (
//   repo: string,
//   collection: string,
//   limit: number = 100
// ): Promise<any> => {
//   // console.log('Listing feed for DID:', feedDid, 'collection:', collection);

//   const agent = await getAuthenticatedAgent();
//   const response = await agent.app.bsky.feed.searchPosts({
//     // feed: `${repo}/${collection}`,
//     author: repo,
//     limit,
//     q: 'e'


//     // limit,
//     // collection,
//     // limit,
//   });

//   console.log(response.data);
//   return response.data;
// }