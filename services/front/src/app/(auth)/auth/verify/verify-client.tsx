"use client";

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/AuthContext';
import { consumeReturnTo } from '@/lib/auth-redirect';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/spinner';

type Purpose = 'login' | 'registration';
type Phase = 'checking' | 'same' | 'different' | 'submitting' | 'success' | 'error';

function VerifyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { login } = useAuth();
  const t = useTranslations('verify');
  const tc = useTranslations('common');

  const [phase, setPhase] = useState<Phase>('checking');
  const [purpose, setPurpose] = useState<Purpose>('login');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const hasChecked = useRef(false);

  const token = searchParams.get('token');

  // 1) Preflight — same browser vs different browser (non-consuming).
  useEffect(() => {
    if (hasChecked.current) return;
    hasChecked.current = true;

    if (!token) {
      setPhase('error');
      setError(t('invalidToken'));
      return;
    }

    (async () => {
      try {
        const res = await fetch('/api/auth/preflight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();

        if (!res.ok) {
          setPhase('error');
          setError(data.error === 'token_expired' ? t('expired') : t('invalidToken'));
          return;
        }

        setPurpose(data.purpose === 'registration' ? 'registration' : 'login');
        setEmail(data.email || '');
        if (data.status === 'same') {
          setPhase('same');
        } else {
          setCode(data.code || '');
          setPhase('different');
        }
      } catch {
        setPhase('error');
        setError(t('failed'));
      }
    })();
  }, [token, t]);

  // 2) Consume the link (button click) — logs in on THIS browser.
  const completeLogin = async () => {
    if (!token) return;
    setPhase('submitting');
    setError('');
    try {
      const endpoint =
        purpose === 'registration'
          ? '/api/auth/verify-registration'
          : '/api/auth/verify-login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();

      if (!res.ok) {
        setPhase('error');
        setError(
          data.error === 'token_expired'
            ? t('expired')
            : data.error === 'different_browser'
            ? t('wrongDevice')
            : t('failed')
        );
        return;
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

      setPhase('success');
      const stashed = consumeReturnTo();
      setTimeout(() => router.push(data.returnUrl || stashed), 1200);
    } catch {
      setPhase('error');
      setError(t('failed'));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-5">
      <Card className="w-full max-w-md text-center">
        <CardContent className="space-y-5 pt-6">
          {phase === 'checking' && (
            <>
              <Spinner className="mx-auto" size="lg" />
              <h2 className="text-lg font-semibold">{t('loading')}</h2>
            </>
          )}

          {(phase === 'same' || phase === 'submitting') && (
            <>
              <h2 className="font-serif text-2xl font-semibold">
                {purpose === 'registration' ? t('sameHeadingRegister') : t('sameHeadingLogin')}
              </h2>
              {email && <p className="text-sm text-muted-foreground">{email}</p>}
              <Button
                className="h-11 w-full"
                onClick={completeLogin}
                disabled={phase === 'submitting'}
              >
                {phase === 'submitting'
                  ? tc('submitting')
                  : purpose === 'registration'
                  ? t('activateHere')
                  : t('loginHere')}
              </Button>
            </>
          )}

          {phase === 'different' && (
            <>
              <h2 className="font-serif text-2xl font-semibold">{t('diffHeading')}</h2>
              <p className="text-sm text-muted-foreground">
                {t('diffBody', { email: email || '' })}
              </p>
              <p className="select-all rounded-lg bg-muted py-4 font-mono text-4xl font-bold tracking-[0.4em]">
                {code}
              </p>
              <Alert>
                <AlertDescription className="text-left text-xs">
                  {t('diffWarning')}
                </AlertDescription>
              </Alert>
              <p className="text-xs text-muted-foreground">{t('diffFooter')}</p>
              <div className="border-t pt-3">
                <Button variant="link" className="text-xs" onClick={() => router.push('/')}>
                  {t('diffStartOver')}
                </Button>
              </div>
            </>
          )}

          {phase === 'success' && (
            <>
              <div className="text-5xl">&#9989;</div>
              <h2 className="text-lg font-semibold text-primary">{t('success')}</h2>
              <p className="text-muted-foreground">{t('redirecting')}</p>
            </>
          )}

          {phase === 'error' && (
            <>
              <div className="text-5xl">&#10060;</div>
              <h2 className="text-lg font-semibold text-destructive">{t('failed')}</h2>
              <p className="text-muted-foreground">{error}</p>
              <Button onClick={() => router.push('/')}>{tc('backToLogin')}</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyClient() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
