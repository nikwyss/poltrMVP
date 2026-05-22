"use client";

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/spinner';

function VerifyLoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { login } = useAuth();
  const t = useTranslations('verifyLogin');
  const tc = useTranslations('common');
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [error, setError] = useState('');
  const hasVerified = useRef(false);

  useEffect(() => {
    if (hasVerified.current) return;
    hasVerified.current = true;

    const verifyToken = async () => {
      const token = searchParams.get('token');

      if (!token) {
        setStatus('error');
        setError(t('invalidToken'));
        return;
      }

      try {
        const response = await fetch(`/api/auth/verify-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, type: 'login' }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || t('verificationFailed'));
        }

        login({
          did: data.user.did,
          handle: data.user.handle,
          displayName: data.user.displayName,
          canton: data.user.canton,
          color: data.user.color,
          mountainFullname: data.user.mountainFullname,
          height: data.user.height,
        });

        setStatus('success');
        setTimeout(() => router.push('/home'), 2000);
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : t('verificationFailed'));
      }
    };

    verifyToken();
  }, [searchParams, router, login]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-5">
      <Card className="w-full max-w-sm text-center">
        <CardContent className="pt-6 space-y-4">
          {status === 'verifying' && (
            <>
              <Spinner className="mx-auto" size="lg" />
              <h2 className="text-lg font-semibold">{t('verifying')}</h2>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="text-5xl">&#9989;</div>
              <h2 className="text-lg font-semibold text-primary">{t('success')}</h2>
              <p className="text-muted-foreground">
                {t('redirecting')}
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="text-5xl">&#10060;</div>
              <h2 className="text-lg font-semibold text-destructive">{t('failed')}</h2>
              <p className="text-muted-foreground">{error}</p>
              <Button onClick={() => router.push('/')}>
                {tc('backToLogin')}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyLogin() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    }>
      <VerifyLoginContent />
    </Suspense>
  );
}
