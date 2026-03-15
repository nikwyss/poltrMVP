"use client";

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/AuthContext';
import { getOAuthClient } from '@/lib/oauthClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/spinner';

export default function Callback() {
  const router = useRouter();
  const { login } = useAuth();
  const t = useTranslations('callback');
  const [error, setError] = useState('');
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const handleCallback = async () => {
      try {
        const client = await getOAuthClient();

        const hashParams = window.location.hash ? window.location.hash.substring(1) : '';
        const queryParams = window.location.search ? window.location.search.substring(1) : '';
        const paramString = hashParams || queryParams;
        const params = new URLSearchParams(paramString);

        const result = await client.callback(params);

        if (!result) {
          throw new Error(t('noSession'));
        }

        const session = result.session;
        const did = session.did;

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
        } catch (e) {
          console.log('Could not fetch profile, using DID');
          const didShort = did.replace('did:plc:', '').substring(0, 10) + '...';
          handle = didShort;
          displayName = didShort;
        }

        login({ did, handle, displayName });
        router.push('/home');
      } catch (err) {
        console.error('Callback error:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
      }
    };

    handleCallback();
  }, [router, login]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-5">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="pt-6 space-y-4">
            <div className="text-5xl">&#10060;</div>
            <h2 className="text-lg font-semibold">{t('authError')}</h2>
            <p className="text-destructive">{error}</p>
            <Button onClick={() => router.push('/')}>
              {t('tryAgain')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <Spinner size="lg" />
      <h2 className="text-lg font-semibold">{t('authenticating')}</h2>
    </div>
  );
}
