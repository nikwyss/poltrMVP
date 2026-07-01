"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/AuthContext';
import { getPendingPeerreviews, getPeerreviewCriteria } from '@/lib/agent';
import type { PeerreviewInvitation, PeerreviewCriterion } from '@/types/ballots';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/spinner';
import { ProContraBadge } from '@/components/pro-contra-badge';
import { ReviewForm } from '@/components/review-form';

export default function ReviewDashboard() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const t = useTranslations('review');
  const tc = useTranslations('common');

  const [invitations, setInvitations] = useState<PeerreviewInvitation[]>([]);
  const [criteriaTemplate, setCriteriaTemplate] = useState<PeerreviewCriterion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Karten sind standardmässig zugeklappt: erst beim Aufklappen wird ReviewForm
  // gemountet → check-in feuert nur für das Gutachten, das man wirklich bearbeitet.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/');
      return;
    }
    loadData();
  }, [isAuthenticated, authLoading, router]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const [invs, crit] = await Promise.all([
        getPendingPeerreviews(),
        getPeerreviewCriteria(),
      ]);
      setInvitations(invs);
      setCriteriaTemplate(crit);
    } catch (err) {
      console.error('Error loading reviews:', err);
      setError(err instanceof Error ? err.message : 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };

  const expand = (argumentUri: string) => {
    setExpanded(prev => new Set(prev).add(argumentUri));
  };

  const handleSubmitted = (argumentUri: string) => {
    setInvitations(prev => prev.filter(inv => inv.argumentUri !== argumentUri));
    setExpanded(prev => {
      const next = new Set(prev);
      next.delete(argumentUri);
      return next;
    });
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] gap-3">
        <Spinner />
        <span className="text-muted-foreground">{tc('restoringSession')}</span>
      </div>
    );
  }
  if (!isAuthenticated || !user) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight pt-5">{t('title')}</h1>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-10 gap-3">
            <Spinner />
            <span className="text-muted-foreground">{t('loadingReviews')}</span>
          </CardContent>
        </Card>
      )}

      {!loading && invitations.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t('noReviews')}
          </CardContent>
        </Card>
      )}

      {!loading && invitations.map((inv) => {
        const isOpen = expanded.has(inv.argumentUri);
        return (
          <Card key={inv.argumentUri}>
            <CardContent className="pt-6">
              {isOpen ? (
                <ReviewForm
                  arg={{
                    argumentUri: inv.argumentUri,
                    title: inv.argument.title,
                    body: inv.argument.body,
                    type: inv.argument.type,
                    ballotRkey: inv.argument.ballotRkey,
                  }}
                  criteriaTemplate={criteriaTemplate}
                  onSubmitted={handleSubmitted}
                />
              ) : (
                <div className="space-y-3">
                  <div
                    className="p-4 bg-muted rounded-md"
                    style={{ borderLeft: `4px solid ${inv.argument.type === 'PRO' ? 'var(--pro)' : 'var(--contra)'}` }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <ProContraBadge type={inv.argument.type?.toLowerCase()} variant="soft" />
                      <span className="text-xs text-muted-foreground">
                        {t('ballot', { rkey: inv.argument.ballotRkey })}
                      </span>
                    </div>
                    <h3 className="m-0 mb-2 font-medium">{inv.argument.title}</h3>
                    <p className="m-0 text-sm text-muted-foreground leading-relaxed line-clamp-2">
                      {inv.argument.body}
                    </p>
                  </div>
                  <Button className="w-full" onClick={() => expand(inv.argumentUri)}>
                    {t('startReview')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
