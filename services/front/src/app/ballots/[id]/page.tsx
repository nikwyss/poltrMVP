"use client";

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '../../../lib/AuthContext';
import { getBallot, listArguments } from '../../../lib/agent';
import { likeBallot, unlikeBallot } from '../../../lib/ballots';
import { formatDate } from '../../../lib/utils';
import type { BallotWithMetadata, ArgumentWithMetadata } from '../../../types/ballots';

export default function BallotDetail() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [ballot, setBallot] = useState<BallotWithMetadata | null>(null);
  const [arguments_, setArguments] = useState<ArgumentWithMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/');
      return;
    }
    loadData();
  }, [isAuthenticated, authLoading, router, id]);

  const loadData = async () => {
    if (!user || !id) return;
    setLoading(true);
    setError('');

    try {
      const [ballotData, argsData] = await Promise.all([
        getBallot(id),
        listArguments(id),
      ]);
      setBallot(ballotData);
      setArguments(argsData);
    } catch (err) {
      console.error('Error loading ballot detail:', err);
      setError(err instanceof Error ? err.message : 'Failed to load ballot');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleLike = useCallback(async () => {
    if (!ballot) return;
    const isLiked = !!ballot.viewer?.like;

    setBallot((prev) =>
      prev
        ? {
            ...prev,
            likeCount: (prev.likeCount ?? 0) + (isLiked ? -1 : 1),
            viewer: isLiked ? undefined : { like: '__pending__' },
          }
        : prev
    );

    try {
      if (isLiked) {
        await unlikeBallot(ballot.viewer!.like!);
        setBallot((prev) => (prev ? { ...prev, viewer: undefined } : prev));
      } else {
        const likeUri = await likeBallot(ballot.uri, ballot.cid);
        setBallot((prev) => (prev ? { ...prev, viewer: { like: likeUri } } : prev));
      }
    } catch (err) {
      console.error('Failed to toggle like:', err);
      setBallot((prev) =>
        prev
          ? {
              ...prev,
              likeCount: (prev.likeCount ?? 0) + (isLiked ? 1 : -1),
              viewer: isLiked ? { like: ballot.viewer!.like! } : undefined,
            }
          : prev
      );
    }
  }, [ballot]);

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        Restoring session...
      </div>
    );
  }
  if (!isAuthenticated || !user) return null;

  const proArgs = arguments_.filter((a) => a.record.type === 'PRO');
  const contraArgs = arguments_.filter((a) => a.record.type === 'CONTRA');

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
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '30px'
        }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => router.push('/ballots')}
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
              &#8592; Back to Ballots
            </button>
            <button
              onClick={() => router.push('/review')}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                backgroundColor: '#7c4dff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Peer Review
            </button>
          </div>
        </div>

        {loading && (
          <div style={{
            textAlign: 'center',
            padding: '40px',
            backgroundColor: 'white',
            borderRadius: '8px'
          }}>
            <p>Loading ballot...</p>
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
              onClick={loadData}
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

        {!loading && ballot && (
          <>
            {/* Ballot card */}
            <div style={{
              backgroundColor: 'white',
              padding: '24px',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              marginBottom: '30px'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '16px'
              }}>
                <h1 style={{ margin: 0, color: '#333', fontSize: '24px' }}>
                  {ballot.record.title}
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                    onClick={handleToggleLike}
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
                <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
                  <strong>Topic:</strong> {ballot.record.topic}
                </div>
              )}

              {ballot.record.text && (
                <p style={{
                  fontSize: '15px',
                  color: '#555',
                  lineHeight: '1.6',
                  marginBottom: '16px'
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
                  <strong>Vote Date:</strong> {formatDate(ballot.record.voteDate)}
                </div>
                {ballot.record.officialRef && (
                  <div style={{ fontSize: '12px', color: '#999' }}>
                    Ref: {ballot.record.officialRef}
                  </div>
                )}
              </div>
            </div>

            {/* Arguments section */}
            {arguments_.length > 0 && (
              <div>
                <h2 style={{ margin: '0 0 20px 0', color: '#333' }}>Arguments</h2>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '20px'
                }}>
                  {/* PRO column */}
                  <div>
                    <h3 style={{
                      margin: '0 0 12px 0',
                      color: '#2e7d32',
                      fontSize: '16px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Pro ({proArgs.length})
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {proArgs.map((arg) => (
                        <div key={arg.uri} style={{
                          backgroundColor: 'white',
                          padding: '16px',
                          borderRadius: '8px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                          borderLeft: '4px solid #4caf50'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <h4 style={{ margin: 0, color: '#333', fontSize: '15px' }}>
                              {arg.record.title}
                            </h4>
                            {arg.reviewStatus === 'preliminary' && (
                              <span style={{
                                fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                                backgroundColor: '#fff3e0', color: '#e65100', whiteSpace: 'nowrap',
                              }}>Preliminary</span>
                            )}
                            {arg.reviewStatus === 'approved' && (
                              <span style={{
                                fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                                backgroundColor: '#e8f5e9', color: '#2e7d32', whiteSpace: 'nowrap',
                              }}>Peer-reviewed</span>
                            )}
                            {arg.reviewStatus === 'rejected' && (
                              <span style={{
                                fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                                backgroundColor: '#ffebee', color: '#c62828', whiteSpace: 'nowrap',
                              }}>Rejected</span>
                            )}
                          </div>
                          <p style={{
                            margin: '0 0 8px 0',
                            fontSize: '14px',
                            color: '#555',
                            lineHeight: '1.5'
                          }}>
                            {arg.record.body}
                          </p>
                          <div style={{ fontSize: '12px', color: '#999' }}>
                            {(arg.likeCount ?? 0) > 0 && (
                              <span>{'\u2661'} {arg.likeCount}</span>
                            )}
                            {(arg.commentCount ?? 0) > 0 && (
                              <span style={{ marginLeft: '12px' }}>
                                {arg.commentCount} comment{arg.commentCount !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                      {proArgs.length === 0 && (
                        <p style={{ color: '#999', fontSize: '14px' }}>No pro arguments yet.</p>
                      )}
                    </div>
                  </div>

                  {/* CONTRA column */}
                  <div>
                    <h3 style={{
                      margin: '0 0 12px 0',
                      color: '#c62828',
                      fontSize: '16px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Contra ({contraArgs.length})
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {contraArgs.map((arg) => (
                        <div key={arg.uri} style={{
                          backgroundColor: 'white',
                          padding: '16px',
                          borderRadius: '8px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                          borderLeft: '4px solid #ef5350'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <h4 style={{ margin: 0, color: '#333', fontSize: '15px' }}>
                              {arg.record.title}
                            </h4>
                            {arg.reviewStatus === 'preliminary' && (
                              <span style={{
                                fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                                backgroundColor: '#fff3e0', color: '#e65100', whiteSpace: 'nowrap',
                              }}>Preliminary</span>
                            )}
                            {arg.reviewStatus === 'approved' && (
                              <span style={{
                                fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                                backgroundColor: '#e8f5e9', color: '#2e7d32', whiteSpace: 'nowrap',
                              }}>Peer-reviewed</span>
                            )}
                            {arg.reviewStatus === 'rejected' && (
                              <span style={{
                                fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                                backgroundColor: '#ffebee', color: '#c62828', whiteSpace: 'nowrap',
                              }}>Rejected</span>
                            )}
                          </div>
                          <p style={{
                            margin: '0 0 8px 0',
                            fontSize: '14px',
                            color: '#555',
                            lineHeight: '1.5'
                          }}>
                            {arg.record.body}
                          </p>
                          <div style={{ fontSize: '12px', color: '#999' }}>
                            {(arg.likeCount ?? 0) > 0 && (
                              <span>{'\u2661'} {arg.likeCount}</span>
                            )}
                            {(arg.commentCount ?? 0) > 0 && (
                              <span style={{ marginLeft: '12px' }}>
                                {arg.commentCount} comment{arg.commentCount !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                      {contraArgs.length === 0 && (
                        <p style={{ color: '#999', fontSize: '14px' }}>No contra arguments yet.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {arguments_.length === 0 && !loading && (
              <div style={{
                textAlign: 'center',
                padding: '40px',
                backgroundColor: 'white',
                borderRadius: '8px',
                color: '#666'
              }}>
                No arguments have been submitted for this ballot yet.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
