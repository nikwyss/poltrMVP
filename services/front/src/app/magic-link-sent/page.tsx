"use client";

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function MagicLinkSentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || 'your email';

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
      <div style={{
        maxWidth: '500px',
        padding: '40px',
        background: '#f5f5f5',
        borderRadius: '8px'
      }}>
        <div style={{
          fontSize: '48px',
          marginBottom: '20px'
        }}>
          &#9993;
        </div>
        <h1 style={{ marginBottom: '20px' }}>Check your email!</h1>
        <p style={{
          fontSize: '16px',
          color: '#666',
          marginBottom: '10px'
        }}>
          We&apos;ve sent a magic link to:
        </p>
        <p style={{
          fontSize: '18px',
          fontWeight: 'bold',
          color: '#0085ff',
          marginBottom: '30px'
        }}>
          {email}
        </p>
        <p style={{
          fontSize: '14px',
          color: '#666',
          marginBottom: '30px'
        }}>
          Click the link in the email to log in. The link will expire in 15 minutes.
        </p>
        <button
          onClick={() => router.push('/')}
          style={{
            padding: '10px 24px',
            fontSize: '14px',
            backgroundColor: 'white',
            color: '#0085ff',
            border: '1px solid #0085ff',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Back to Login
        </button>
      </div>
    </div>
  );
}

export default function MagicLinkSent() {
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
      <MagicLinkSentContent />
    </Suspense>
  );
}
