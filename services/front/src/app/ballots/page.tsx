"use client";

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/AuthContext';
import { listBallots } from '../../lib/agent';
import { likeBallot, unlikeBallot } from '../../lib/ballots';
import { formatDate } from '../../lib/utils';
import type { BallotWithMetadata } from '../../types/ballots';



export default function BallotSearch() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const [ballots, setBallots] = useState<BallotWithMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return; // wait for auth restoration
    if (!isAuthenticated) {
      router.push('/');
      return;
    }
    loadBallots();
  }, [isAuthenticated, authLoading, router]);

  const loadBallots = async () => {
    if (!user) return;

    setLoading(true);
    setError('');

    try {

      const ballots: BallotWithMetadata[] = await listBallots()
      console.log('Fetched ballots:', ballots);

      setBallots(ballots || []);
    } catch (err) {
      console.error('Error loading ballots:', err);
      setError(err instanceof Error ? err.message : 'Failed to load ballots');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleLike = useCallback(async (ballot: BallotWithMetadata) => {
    const isLiked = !!ballot.viewer?.like;

    // Optimistic update
    setBallots((prev) =>
      prev.map((b) =>
        b.uri === ballot.uri
          ? {
              ...b,
              likeCount: (b.likeCount ?? 0) + (isLiked ? -1 : 1),
              viewer: isLiked ? undefined : { like: '__pending__' },
            }
          : b
      )
    );

    try {
      if (isLiked) {
        await unlikeBallot(ballot.viewer!.like!);
        setBallots((prev) =>
          prev.map((b) =>
            b.uri === ballot.uri ? { ...b, viewer: undefined } : b
          )
        );
      } else {
        const likeUri = await likeBallot(ballot.uri, ballot.cid);
        setBallots((prev) =>
          prev.map((b) =>
            b.uri === ballot.uri ? { ...b, viewer: { like: likeUri } } : b
          )
        );
      }
    } catch (err) {
      console.error('Failed to toggle like:', err);
      // Revert optimistic update
      setBallots((prev) =>
        prev.map((b) =>
          b.uri === ballot.uri
            ? {
                ...b,
                likeCount: (b.likeCount ?? 0) + (isLiked ? 1 : -1),
                viewer: isLiked ? { like: ballot.viewer!.like! } : undefined,
              }
            : b
        )
      );
    }
  }, []);

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        Restoring session...
      </div>
    );
  }
  if (!isAuthenticated || !user) return null;

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '30px'
        }}>
          <h1 style={{ margin: 0 }}>Swiss Ballot Entries.</h1>
          <button
            onClick={() => router.push('/home')}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              backgroundColor: '#0085ff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            &#8592; Back to Home
          </button>
        </div>

      {loading && (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          backgroundColor: 'white',
          borderRadius: '8px'
        }}>
          <p>Loading ballots...</p>
        </div>
      )}

      {error && (
        <div style={{
          padding: '20px',
          backgroundColor: '#ffebee',
          color: '#d32f2f',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '1px solid #ffcdd2'
        }}>
          <strong>Error:</strong> {error}
          <button
            onClick={loadBallots}
            style={{
              marginLeft: '20px',
              padding: '8px 16px',
              backgroundColor: '#d32f2f',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && ballots.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          backgroundColor: 'white',
          borderRadius: '8px'
        }}>
          <p style={{ color: '#666', fontSize: '18px' }}>
            No ballot entries found.
          </p>
        </div>
      )}

      {!loading && ballots.length > 0 && (
        <div style={{
          display: 'grid',
          gap: '20px',
          gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))'
        }}>
          {ballots.map((ballot) => {
            const rkey = ballot.uri.split('/').pop();
            return (
            <div
              key={ballot.uri}
              onClick={() => rkey && router.push(`/ballots/${rkey}`)}
              style={{
                backgroundColor: 'white',
                padding: '20px',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '10px'
              }}>
                <h3 style={{
                  margin: '0 0 10px 0',
                  color: '#333',
                  fontSize: '18px'
                }}>
                  {ballot.record.title}
                </h3>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  {ballot.record.language && (
                    <span style={{
                      fontSize: '12px',
                      padding: '4px 8px',
                      backgroundColor: '#e3f2fd',
                      borderRadius: '4px',
                      color: '#1976d2'
                    }}>
                      {ballot.record.language}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleToggleLike(ballot);
                    }}
                    title={ballot.viewer?.like ? 'Unlike' : 'Like'}
                    style={{
                      background: 'none',
                      border: '1px solid transparent',
                      padding: '2px 4px',
                      fontSize: '20px',
                      cursor: 'pointer',
                      color: ballot.viewer?.like ? '#d81b60' : '#b0bec5',
                      transition: 'color 0.2s'
                    }}
                  >
                    {ballot.viewer?.like ? '\u2764' : '\u2661'}
                    {(ballot.likeCount ?? 0) > 0 && (
                      <span style={{ fontSize: '12px', marginLeft: '4px' }}>
                        {ballot.likeCount}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {ballot.record.topic && (
                <div style={{
                  fontSize: '14px',
                  color: '#666',
                  marginBottom: '8px'
                }}>
                  <strong>Topic:</strong> {ballot.record.topic}
                </div>
              )}

              {ballot.record.text && (
                <p style={{
                  fontSize: '14px',
                  color: '#666',
                  marginBottom: '12px',
                  lineHeight: '1.5',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}>
                  {ballot.record.text}
                </p>
              )}

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '16px',
                paddingTop: '16px',
                borderTop: '1px solid #eee'
              }}>
                <div style={{ fontSize: '14px', color: '#666' }}>
                  <strong>Vote Date:</strong><br />
                  {formatDate(ballot.record.voteDate)}
                </div>
                {ballot.record.officialRef && (
                  <div style={{
                    fontSize: '12px',
                    color: '#999'
                  }}>
                    Ref: (1) {ballot.record.officialRef}
                  </div>
                )}
              </div>

              <div style={{
                marginTop: '12px',
                fontSize: '11px',
                color: '#999',
                wordBreak: 'break-all'
              }}>
                URI: {ballot.uri}
              </div>
            </div>
          );
          })}
        </div>
      )}

      {!loading && ballots.length > 0 && (
        <div style={{
          marginTop: '30px',
          textAlign: 'center',
          color: '#666'
        }}>
          Found {ballots.length} ballot{ballots.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  </div>
);
}
