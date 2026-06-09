"use client";

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/AuthContext';
import { consumeReturnTo } from '@/lib/auth-redirect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/spinner';

function MagicLinkSentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const t = useTranslations('magicLink');
  const tc = useTranslations('common');
  const email = searchParams.get('email') || 'your email';
  const purpose = searchParams.get('purpose');
  const isRegistration = purpose === 'registration';

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleVerifyCode = async () => {
    if (code.length !== 6) return;
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/auth/verify-short-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          code: code.toUpperCase(),
          purpose: isRegistration ? 'registration' : 'login',
        }),
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

      login({
        did: data.user.did,
        handle: data.user.handle,
        displayName: data.user.displayName,
        canton: data.user.canton,
        color: data.user.color,
        mountainFullname: data.user.mountainFullname,
        height: data.user.height,
      });

      // Server-Wert (cross-device) bevorzugen; localStorage trotzdem leeren.
      const stashed = consumeReturnTo();
      router.push(data.returnUrl || stashed);
    } catch {
      setError(t('invalidCodeGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-5">
      <Card className="w-full max-w-lg text-center">
        <CardHeader>
          <div className="text-5xl mb-2">&#9993;</div>
          <CardTitle className="text-2xl">{t('checkEmail')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            {isRegistration ? t('sentConfirmation') : t('sentMagic')}
          </p>
          <p className="text-lg font-bold text-primary">
            {email}
          </p>
          <p className="text-sm text-muted-foreground">
            {isRegistration ? t('clickToRegister') : t('clickToLogin')}
          </p>

          <div className="border-t pt-4 mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('orEnterCode')}
            </p>
            <Input
              type="text"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^ABCDEFGHJKMNPQRSTUVWXYZ23456789]/g, ''))}
              placeholder={t('codePlaceholder')}
              className="text-center text-2xl font-mono tracking-[0.3em] uppercase"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleVerifyCode();
              }}
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button
              onClick={handleVerifyCode}
              disabled={code.length !== 6 || submitting}
              className="w-full"
            >
              {submitting ? t('verifying') : t('verifyCode')}
            </Button>
          </div>

          <Button variant="outline" onClick={() => router.push('/')}>
            {tc('backToLogin')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function MagicLinkSent() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    }>
      <MagicLinkSentContent />
    </Suspense>
  );
}
