"use client";

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { MailCheck } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { consumeReturnTo } from '@/lib/auth-redirect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/spinner';

type WaitState = 'waiting' | 'authenticated' | 'gone';

function MagicLinkSentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const t = useTranslations('magicLink');
  const email = searchParams.get('email') || '';

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [waitState, setWaitState] = useState<WaitState>('waiting');
  const redirecting = useRef(false);

  // Poll: detect a login completed in another tab (authenticated) or an expired/
  // used link (gone). The direct code path below redirects on its own.
  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const res = await fetch('/api/auth/wait-status', { method: 'POST' });
        const data = await res.json();
        if (!active) return;
        if (data.state === 'authenticated') setWaitState('authenticated');
        else if (data.state === 'gone') setWaitState('gone');
      } catch {
        // transient — keep polling
      }
    };
    const id = setInterval(() => {
      if (waitState === 'waiting') tick();
    }, 3000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [waitState]);

  const handleVerifyCode = async () => {
    if (code.length !== 6 || redirecting.current) return;
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/auth/verify-short-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: code.toUpperCase() }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === 'too_many_attempts') {
          setError(t('tooManyAttempts'));
        } else if (data.error === 'invalid_code') {
          const remaining = data.remaining_attempts;
          setError(
            remaining !== undefined
              ? t('invalidCode', { remaining })
              : t('invalidCodeGeneric')
          );
        } else {
          setError(data.message || t('invalidCodeGeneric'));
        }
        return;
      }

      redirecting.current = true;
      login({
        did: data.user.did,
        handle: data.user.handle,
        displayName: data.user.displayName,
        canton: data.user.canton,
        color: data.user.color,
        mountainFullname: data.user.mountainFullname,
        height: data.user.height,
      });

      const stashed = consumeReturnTo();
      router.push(data.returnUrl || stashed);
    } catch {
      setError(t('invalidCodeGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  // Login completed in another tab of the same browser.
  if (waitState === 'authenticated') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-5">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="space-y-4 pt-6">
            <div className="text-5xl">&#9989;</div>
            <CardTitle className="text-xl">{t('authenticatedTitle')}</CardTitle>
            {/* Hard navigation, not router.push: the login happened in another tab,
                so THIS tab's AuthContext is stale (isAuthenticated still false) and
                a client-side push would bounce off the (app) guard back to login.
                A full load re-initialises AuthContext against the now-valid cookie. */}
            <Button className="h-11 w-full" onClick={() => { window.location.href = consumeReturnTo(); }}>
              {t('toApp')}
            </Button>
            <p className="text-xs text-muted-foreground">{t('canCloseTab')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Link expired or already used elsewhere.
  if (waitState === 'gone') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-5">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="space-y-4 pt-6">
            <div className="text-5xl">&#9203;</div>
            <CardTitle className="text-xl">{t('expiredTitle')}</CardTitle>
            <p className="text-muted-foreground">{t('expiredBody')}</p>
            <Button className="h-11 w-full" onClick={() => router.push('/')}>
              {t('requestNew')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm px-7 py-9">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <MailCheck className="h-7 w-7 text-primary" />
          </div>
          <p className="mt-4 text-xs font-medium uppercase tracking-[0.35em] text-muted-foreground">
            POLTR
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight">
            {t('checkInbox')}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('sentTo')}</p>
          {email && <p className="mt-1 font-semibold text-foreground">{email}</p>}
        </div>

        <div className="mt-6 flex flex-col items-center gap-1">
          <p className="text-xs text-muted-foreground">{t('spamHint')}</p>
          <Button variant="link" className="text-xs" onClick={() => router.push('/')}>
            {t('wrongAddress')}
          </Button>
        </div>

        {/* Cross-device fallback: code shown on the other browser, typed here. */}
        <div className="mt-5 space-y-3 border-t pt-5">
          <p className="text-xs text-muted-foreground">{t('otherDeviceReveal')}</p>
          <Input
            type="text"
            maxLength={6}
            value={code}
            onChange={(e) =>
              setCode(
                e.target.value
                  .toUpperCase()
                  .replace(/[^ABCDEFGHJKMNPQRSTUVWXYZ23456789]/g, '')
              )
            }
            placeholder={t('codePlaceholder')}
            className="text-center font-mono text-2xl uppercase tracking-[0.3em]"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleVerifyCode();
            }}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            onClick={handleVerifyCode}
            disabled={code.length !== 6 || submitting}
            className="w-full"
          >
            {submitting ? t('verifying') : t('verifyCode')}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function MagicLinkSent() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <MagicLinkSentContent />
    </Suspense>
  );
}
