"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/spinner';

export default function Login() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const t = useTranslations('login');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace('/home');
    }
  }, [isAuthenticated, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/xrpc/ch.poltr.auth.sendMagicLink`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
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
  // authenticated (redirect to /home is in flight), show a wait screen instead
  // of flashing the login form.
  if (authLoading || isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <img
        src="/images/arcades_fine.svg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none fixed bottom-0 left-0 -z-10 h-[60vh] w-auto select-none opacity-[0.18]"
      />

      {/* Logo + login form combined horizontally in one card */}
      <div className="flex w-full flex-col items-center justify-center p-8">
        <Card className="w-full max-w-2xl">
          <div className="flex flex-col items-center gap-6 p-6 md:flex-row md:items-center md:gap-8">
            <img
              src="/logo5.svg"
              alt="Poltr"
              className="w-32 h-32 shrink-0 md:w-48 md:h-48"
            />
            <div className="w-full max-w-sm">
              <CardHeader className="text-center px-0">
                <CardTitle className="text-2xl">{t('title')}</CardTitle>
                <CardDescription>
                  {t('description')}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  {t('emailLabel')}
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('emailPlaceholder')}
                  required
                  disabled={loading}
                />
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t('sending') : t('sendMagicLink')}
              </Button>
              <div className="text-center">
                <Button
                  type="button"
                  variant="link"
                  onClick={() => router.push('/auth/register')}
                  disabled={loading}
                >
                  {t('noAccount')}
                </Button>
              </div>
              </form>
              </CardContent>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
