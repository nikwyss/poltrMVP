'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '../../lib/AuthContext';
import { getOAuthClient } from '../../lib/oauthClient';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [error, setError] = useState('');
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) {
      return;
    }
    hasProcessed.current = true;

    const handleCallback = async () => {
      try {
        const client = await getOAuthClient();

        // Get params from URL (check both hash and query string)
        const hashParams = window.location.hash ? window.location.hash.substring(1) : '';
        const queryParams = window.location.search ? window.location.search.substring(1) : '';
        const paramString = hashParams || queryParams;
        const params = new URLSearchParams(paramString);

        const result = await client.callback(params);

        if (!result) {
          throw new Error('No session returned from callback');
        }

        const session = result.session;
        const did = session.did;

        // Get handle and profile info
        let handle: string = did;
        let displayName: string = 'User';

        try {
          const profileUrl = `https://bsky.social/xrpc/com.atproto.repo.describeRepo?repo=${did}`;
          const profileResponse = await fetch(profileUrl);

          if (profileResponse.ok) {
            const profileData = await profileResponse.json();
            handle = profileData.handle || did;
            displayName = profileData.displayName || handle;
          }
        } catch {
          console.log('Could not fetch profile, using DID');
          const didShort = did.replace('did:plc:', '').substring(0, 10) + '...';
          handle = didShort;
          displayName = didShort;
        }

        login(
          {
            did: did,
            handle: handle,
            displayName: displayName,
          },
          session
        );

        router.push('/');
      } catch (err) {
        console.error('Callback error:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
      }
    };

    handleCallback();
  }, [router, login, searchParams]);

  if (error) {
    return (
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Authentication Error</h1>
        <p className="text-red-600 mb-6">{error}</p>
        <button
          onClick={() => router.push('/')}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <h2 className="text-lg font-medium text-gray-900">Authenticating...</h2>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <h2 className="text-lg font-medium text-gray-900">Loading...</h2>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-50">
      <Suspense fallback={<LoadingFallback />}>
        <CallbackContent />
      </Suspense>
    </main>
  );
}
