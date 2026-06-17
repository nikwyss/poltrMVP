"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/AuthContext';
import { consumeReturnTo, peekReturnTo } from '@/lib/auth-redirect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/spinner';
import { PageBackdrop } from '@/components/page-backdrop';

export default function Welcome() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const t = useTranslations('login');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace(consumeReturnTo());
    }
  }, [isAuthenticated, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Unified entry point — the server decides login vs registration and sets
      // the initiator cookie. The UI is identical either way until the email.
      const response = await fetch(`/api/auth/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, returnUrl: peekReturnTo() }),
      });

      const text = await response.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(t('serverError'));
      }

      if (!response.ok) {
        throw new Error(data.message || t('failedToSend'));
      }

      router.push(`/auth/magic-link-sent?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToSend'));
      setLoading(false);
    }
  };

  // While the session is still being verified, or once we know the user is
  // authenticated (redirect in flight), show a spinner instead of flashing the form.
  if (authLoading || isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <PageBackdrop />

      <Card className="w-full max-w-sm px-7 py-9">
        <div className="flex flex-col items-center text-center">
          {/* Mascot tile */}
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-sm">
            <img src="/logo5.svg" alt="" className="h-11 w-11" />
          </div>

          <p className="mt-4 text-xs font-medium uppercase tracking-[0.35em] text-muted-foreground">
            POLTR
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight">
            {t('title')}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('description')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-7 space-y-3">
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('emailPlaceholder')}
            aria-label={t('emailLabel')}
            required
            disabled={loading}
            className="h-11 text-center"
          />
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="h-11 w-full" disabled={loading}>
            {loading ? t('sending') : t('sendMagicLink')}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {t('autoCreateHint')}
        </p>
      </Card>
    </div>
  );
}
