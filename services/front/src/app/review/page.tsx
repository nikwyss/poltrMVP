"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/AuthContext';
import { getPendingReviews, getReviewCriteria, submitReview } from '../../lib/agent';
import type { ReviewInvitation, ReviewCriterion, ReviewCriterionRating } from '../../types/ballots';

interface ReviewFormState {
  criteria: ReviewCriterionRating[];
  vote: 'APPROVE' | 'REJECT' | null;
  justification: string;
}

export default function ReviewDashboard() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();

  const [invitations, setInvitations] = useState<ReviewInvitation[]>([]);
  const [criteriaTemplate, setCriteriaTemplate] = useState<ReviewCriterion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formStates, setFormStates] = useState<Record<string, ReviewFormState>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<Record<string, string>>({});

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
        getPendingReviews(),
        getReviewCriteria(),
      ]);
      setInvitations(invs);
      setCriteriaTemplate(crit);

      // Initialize form states
      const states: Record<string, ReviewFormState> = {};
      for (const inv of invs) {
        states[inv.argumentUri] = {
          criteria: crit.map(c => ({ ...c, rating: 3 })),
          vote: null,
          justification: '',
        };
      }
      setFormStates(states);
    } catch (err) {
      console.error('Error loading reviews:', err);
      setError(err instanceof Error ? err.message : 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };

  const updateCriterionRating = (argumentUri: string, key: string, rating: number) => {
    setFormStates(prev => ({
      ...prev,
      [argumentUri]: {
        ...prev[argumentUri],
        criteria: prev[argumentUri].criteria.map(c =>
          c.key === key ? { ...c, rating } : c
        ),
      },
    }));
  };

  const updateVote = (argumentUri: string, vote: 'APPROVE' | 'REJECT') => {
    setFormStates(prev => ({
      ...prev,
      [argumentUri]: { ...prev[argumentUri], vote },
    }));
  };

  const updateJustification = (argumentUri: string, justification: string) => {
    setFormStates(prev => ({
      ...prev,
      [argumentUri]: { ...prev[argumentUri], justification },
    }));
  };

  const handleSubmit = async (argumentUri: string) => {
    const form = formStates[argumentUri];
    if (!form || !form.vote) return;

    if (form.vote === 'REJECT' && !form.justification.trim()) {
      setError('Justification is required for rejection.');
      return;
    }

    setSubmitting(argumentUri);
    setError('');
    try {
      await submitReview(
        argumentUri,
        form.criteria,
        form.vote,
        form.justification || undefined,
      );
      setSubmitResult(prev => ({
        ...prev,
        [argumentUri]: 'Review submitted. The result will appear once enough reviews are collected.',
      }));
      // Remove from list
      setInvitations(prev => prev.filter(inv => inv.argumentUri !== argumentUri));
    } catch (err) {
      console.error('Submit failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit review');
    } finally {
      setSubmitting(null);
    }
  };

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        Restoring session...
      </div>
    );
  }
  if (!isAuthenticated || !user) return null;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5', padding: '20px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <h1 style={{ margin: 0, color: '#333' }}>Peer Review</h1>
          <button
            onClick={() => router.push('/ballots')}
            style={{
              padding: '10px 20px', fontSize: '14px', backgroundColor: '#0085ff',
              color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer',
            }}
          >
            Back to Ballots
          </button>
        </div>

        {error && (
          <div style={{
            padding: '12px 16px', backgroundColor: '#ffebee', color: '#d32f2f',
            borderRadius: '8px', marginBottom: '20px', border: '1px solid #ffcdd2',
          }}>
            {error}
          </div>
        )}

        {Object.entries(submitResult).map(([uri, msg]) => (
          <div key={uri} style={{
            padding: '12px 16px', backgroundColor: '#e8f5e9', color: '#2e7d32',
            borderRadius: '8px', marginBottom: '12px', border: '1px solid #c8e6c9',
          }}>
            {msg}
          </div>
        ))}

        {loading && (
          <div style={{ textAlign: 'center', padding: '40px', backgroundColor: 'white', borderRadius: '8px' }}>
            <p>Loading pending reviews...</p>
          </div>
        )}

        {!loading && invitations.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '40px', backgroundColor: 'white',
            borderRadius: '8px', color: '#666',
          }}>
            No pending reviews. Check back later.
          </div>
        )}

        {!loading && invitations.map((inv) => {
          const form = formStates[inv.argumentUri];
          if (!form) return null;
          const isSubmitting = submitting === inv.argumentUri;

          return (
            <div key={inv.argumentUri} style={{
              backgroundColor: 'white', padding: '24px', borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginBottom: '20px',
            }}>
              {/* Argument preview */}
              <div style={{
                padding: '16px', backgroundColor: '#fafafa', borderRadius: '6px',
                borderLeft: `4px solid ${inv.argument.type === 'PRO' ? '#4caf50' : '#ef5350'}`,
                marginBottom: '20px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{
                    fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                    backgroundColor: inv.argument.type === 'PRO' ? '#e8f5e9' : '#ffebee',
                    color: inv.argument.type === 'PRO' ? '#2e7d32' : '#c62828',
                    fontWeight: 600,
                  }}>
                    {inv.argument.type}
                  </span>
                  <span style={{ fontSize: '12px', color: '#999' }}>
                    Ballot: {inv.argument.ballotRkey}
                  </span>
                </div>
                <h3 style={{ margin: '0 0 8px 0', color: '#333', fontSize: '16px' }}>
                  {inv.argument.title}
                </h3>
                <p style={{ margin: 0, fontSize: '14px', color: '#555', lineHeight: '1.6' }}>
                  {inv.argument.body}
                </p>
              </div>

              {/* Criteria sliders */}
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 12px 0', color: '#333', fontSize: '14px' }}>
                  Criteria Assessment
                </h4>
                {form.criteria.map((criterion) => (
                  <div key={criterion.key} style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <label style={{ fontSize: '13px', color: '#555' }}>{criterion.label}</label>
                      <span style={{ fontSize: '13px', color: '#333', fontWeight: 600 }}>{criterion.rating}/5</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      step={1}
                      value={criterion.rating}
                      onChange={(e) => updateCriterionRating(inv.argumentUri, criterion.key, parseInt(e.target.value))}
                      style={{ width: '100%' }}
                    />
                  </div>
                ))}
              </div>

              {/* Vote toggle */}
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#333', fontSize: '14px' }}>Decision</h4>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    type="button"
                    onClick={() => updateVote(inv.argumentUri, 'APPROVE')}
                    style={{
                      flex: 1, padding: '10px', border: '2px solid',
                      borderColor: form.vote === 'APPROVE' ? '#4caf50' : '#ddd',
                      backgroundColor: form.vote === 'APPROVE' ? '#e8f5e9' : 'white',
                      color: form.vote === 'APPROVE' ? '#2e7d32' : '#666',
                      borderRadius: '6px', cursor: 'pointer', fontWeight: 600,
                    }}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => updateVote(inv.argumentUri, 'REJECT')}
                    style={{
                      flex: 1, padding: '10px', border: '2px solid',
                      borderColor: form.vote === 'REJECT' ? '#ef5350' : '#ddd',
                      backgroundColor: form.vote === 'REJECT' ? '#ffebee' : 'white',
                      color: form.vote === 'REJECT' ? '#c62828' : '#666',
                      borderRadius: '6px', cursor: 'pointer', fontWeight: 600,
                    }}
                  >
                    Reject
                  </button>
                </div>
              </div>

              {/* Justification */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '4px' }}>
                  Justification {form.vote === 'REJECT' ? '(required)' : '(optional)'}
                </label>
                <textarea
                  value={form.justification}
                  onChange={(e) => updateJustification(inv.argumentUri, e.target.value)}
                  placeholder="Explain your decision..."
                  rows={3}
                  style={{
                    width: '100%', padding: '10px', border: '1px solid #ddd',
                    borderRadius: '6px', fontSize: '14px', resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Submit */}
              <button
                type="button"
                onClick={() => handleSubmit(inv.argumentUri)}
                disabled={!form.vote || isSubmitting}
                style={{
                  width: '100%', padding: '12px', fontSize: '14px', fontWeight: 600,
                  backgroundColor: form.vote ? '#0085ff' : '#ccc',
                  color: 'white', border: 'none', borderRadius: '6px',
                  cursor: form.vote ? 'pointer' : 'not-allowed',
                  opacity: isSubmitting ? 0.7 : 1,
                }}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Review'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
