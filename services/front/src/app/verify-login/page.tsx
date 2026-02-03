"use client";

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../lib/AuthContext';

function VerifyLoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { login } = useAuth();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [error, setError] = useState('');
  const hasVerified = useRef(false);

  useEffect(() => {
    // Prevent double verification in StrictMode
    if (hasVerified.current) return;
    hasVerified.current = true;

    const verifyToken = async () => {
      const token = searchParams.get('token');

      if (!token) {
        setStatus('error');
        setError('Invalid or missing token');
        return;
      }

      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

        const response = await fetch(`${apiUrl}/auth/verify_login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token, type: 'login' }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Verification failed');
        }

        // Store session token in localStorage as fallback (cookies may not work cross-origin in dev)
        if (data.session_token) {
          localStorage.setItem('session_token', data.session_token);
        }

        // Store user data
        login({
          did: data.user.did,
          handle: data.user.handle,
          displayName: data.user.displayName,
        });

        setStatus('success');

        // Redirect to home after 2 seconds
        setTimeout(() => {
          router.push('/home');
        }, 2000);

      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Verification failed');
      }
    };

    verifyToken();
  }, [searchParams, router, login]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '20px',
      textAlign: 'center'
    }}>
      {status === 'verifying' && (
        <div>
          <div style={{
            fontSize: '48px',
            marginBottom: '20px',
            animation: 'spin 1s linear infinite'
          }}>
            &#8987;
          </div>
          <h2>Verifying your magic link...</h2>
        </div>
      )}

      {status === 'success' && (
        <div>
          <div style={{
            fontSize: '48px',
            marginBottom: '20px'
          }}>
            &#9989;
          </div>
          <h2 style={{ color: '#0085ff' }}>Success!</h2>
          <p style={{ color: '#666', marginTop: '10px' }}>
            Redirecting you to the app...
          </p>
        </div>
      )}

      {status === 'error' && (
        <div>
          <div style={{
            fontSize: '48px',
            marginBottom: '20px'
          }}>
            &#10060;
          </div>
          <h2 style={{ color: 'red' }}>Verification Failed</h2>
          <p style={{
            color: '#666',
            marginTop: '10px',
            marginBottom: '20px'
          }}>
            {error}
          </p>
          <button
            onClick={() => router.push('/')}
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
            Back to Login
          </button>
        </div>
      )}
    </div>
  );
}

export default function VerifyLogin() {
  return (
    <Suspense fallback={
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh'
      }}>
        Loading...
      </div>
    }>
      <VerifyLoginContent />
    </Suspense>
  );
}
