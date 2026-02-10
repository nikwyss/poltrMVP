"use client";

import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../lib/AuthContext';
import { useEffect, useState, Suspense } from 'react';
import { initiateEidVerification } from '../../lib/agent';
import { useAppPassword } from '../../lib/useAppPassword';

function HomeContent() {
  const { user, isAuthenticated, logout, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { appPassword, loading: appPasswordLoading, error: appPasswordError, handleCreateAppPassword } = useAppPassword();
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationSuccess, setVerificationSuccess] = useState(false);

  // Check for verification callback params
  useEffect(() => {
    if (searchParams.get('verified') === 'true') {
      setVerificationSuccess(true);
    }
    if (searchParams.get('error') === 'verification_failed') {
      setVerificationError('E-ID verification failed. Please try again.');
    }
  }, [searchParams]);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, loading, router]);

  if (loading) {
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'sans-serif'}}>
        Restoring session...
      </div>
    );
  }

  if (!user) return null;

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const handleStartVerification = async () => {
    setVerificationLoading(true);
    setVerificationError(null);
    try {
      const { redirect_url } = await initiateEidVerification();
      window.location.href = redirect_url;
    } catch (err) {
      setVerificationError(
        err instanceof Error ? err.message : 'Failed to start verification'
      );
      setVerificationLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '20px'
    }}>
      <h1>Hello {user.displayName}! You did it.</h1>
      <div style={{
        marginTop: '20px',
        padding: '20px',
        background: '#f5f5f5',
        borderRadius: '8px',
        textAlign: 'center'
      }}>
        <p><strong>DID:</strong> {user.did}</p>
        <p><strong>Handle:</strong> {user.handle}</p>
      </div>

      <div style={{
        marginTop: '30px',
        display: 'flex',
        gap: '16px'
      }}>
        <button
          onClick={() => router.push('/ballots')}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: '#0085ff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          View Proposals
        </button>

        <button
          onClick={handleStartVerification}
          disabled={verificationLoading}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: '#0085ff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: verificationLoading ? 'not-allowed' : 'pointer',
            opacity: verificationLoading ? 0.7 : 1
          }}
        >
          {verificationLoading ? 'Starting...' : 'swiyu-Verification'}
        </button>

        <button
          onClick={handleCreateAppPassword}
          disabled={appPasswordLoading}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: '#0085ff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: appPasswordLoading ? 'not-allowed' : 'pointer',
            opacity: appPasswordLoading ? 0.7 : 1
          }}
        >
          {appPasswordLoading ? 'Creating...' : 'Create App Password'}
        </button>

        <button
          onClick={handleLogout}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: '#ff4444',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Logout
        </button>
      </div>

      {verificationSuccess && (
        <div
          style={{
            marginTop: '20px',
            padding: '16px',
            backgroundColor: '#e8f5e9',
            border: '1px solid #4caf50',
            borderRadius: '8px',
            color: '#2e7d32',
            maxWidth: '400px',
            textAlign: 'center'
          }}
        >
          E-ID verification successful! Your account is now verified.
        </div>
      )}

      {verificationError && (
        <div
          style={{
            marginTop: '20px',
            padding: '16px',
            backgroundColor: '#ffebee',
            border: '1px solid #f44336',
            borderRadius: '8px',
            color: '#c62828',
            maxWidth: '400px',
            textAlign: 'center'
          }}
        >
          {verificationError}
        </div>
      )}

      {appPasswordError && (
        <div
          style={{
            marginTop: '20px',
            padding: '16px',
            backgroundColor: '#ffebee',
            border: '1px solid #f44336',
            borderRadius: '8px',
            color: '#c62828',
            maxWidth: '400px',
            textAlign: 'center'
          }}
        >
          {appPasswordError}
        </div>
      )}

      {appPassword && (
        <div
          style={{
            marginTop: '20px',
            padding: '20px',
            backgroundColor: '#e8f5e9',
            border: '1px solid #4caf50',
            borderRadius: '8px',
            maxWidth: '400px'
          }}
        >
          <h3 style={{ margin: '0 0 12px 0', color: '#2e7d32' }}>
            App Password Created!
          </h3>
          <p style={{ margin: '8px 0', wordBreak: 'break-all' }}>
            <strong>Password:</strong>{' '}
            <code
              style={{
                backgroundColor: '#fff',
                padding: '4px 8px',
                borderRadius: '4px',
                fontFamily: 'monospace'
              }}
            >
              {appPassword.password}
            </code>
          </p>
          <div
            style={{
              marginTop: '16px',
              padding: '12px',
              backgroundColor: '#fff3e0',
              border: '1px solid #ff9800',
              borderRadius: '4px'
            }}
          >
            <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', color: '#e65100' }}>
              &#9888; Copy this password now!
            </p>
            <p style={{ margin: '0', fontSize: '14px', color: '#bf360c' }}>
              It will not be shown again.
            </p>
          </div>
          <div style={{ marginTop: '16px', fontSize: '14px' }}>
            <p style={{ margin: '4px 0' }}>
              <strong>Use this to login to Bluesky with:</strong>
            </p>
            <p style={{ margin: '4px 0' }}>
              Handle: <code>{user.handle}</code>
            </p>
            <p style={{ margin: '4px 0' }}>Password: (the password above)</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'sans-serif'}}>
        Loading...
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
