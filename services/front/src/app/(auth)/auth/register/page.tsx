"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { peekReturnTo } from '@/lib/auth-redirect';

export default function Register() {
  const router = useRouter();
  const t = useTranslations('register');
  const [formData, setFormData] = useState({
    email: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`/api/xrpc/ch.poltr.auth.register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email, returnUrl: peekReturnTo() }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: t('failed') }));
        throw new Error(errorData.message || `${t('failed')}: ${response.statusText}`);
      }

      await response.json().catch(() => ({}));
      router.push(`/auth/magic-link-sent?email=${encodeURIComponent(formData.email)}&purpose=registration`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedGeneric'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-5">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">{t('title')}</CardTitle>
          <CardDescription>
            {t('description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                {t('emailLabel')}
              </label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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

            {success && (
              <Alert>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('creating') : t('createAccount')}
            </Button>

            <div className="text-center">
              <Button
                type="button"
                variant="link"
                onClick={() => router.push('/')}
                disabled={loading}
              >
                {t('hasAccount')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
