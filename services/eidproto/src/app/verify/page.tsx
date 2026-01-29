'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

type VerificationStatus = 'loading' | 'initiating' | 'pending' | 'success' | 'error';

interface SessionData {
  did: string;
  handle: string;
  access_token: string;
  refresh_token: string;
  pds_url: string;
  success_url: string;
  error_url: string;
}

interface InitiateResponse {
  state_token: string;
  verification_id: string;
  verification_url: string;
  verification_deeplink: string;
  expires_at: string;
}

interface StatusResponse {
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'ERROR';
  redirect_url?: string;
  message?: string;
  eid_hash?: string;
}

function VerifyContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<VerificationStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [verificationData, setVerificationData] = useState<InitiateResponse | null>(null);
  const [message, setMessage] = useState<string>('Loading...');

  // Get code from URL
  const code = searchParams.get('code');

  // Exchange code for session data
  const exchangeCode = useCallback(async () => {
    if (!code) {
      setError('Missing verification code. Please start verification from your app.');
      setStatus('error');
      return;
    }

    try {
      const response = await fetch('/api/verify/exchange-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Invalid or expired code');
      }

      const data: SessionData = await response.json();
      setSessionData(data);
      setStatus('initiating');
      setMessage('Initializing verification...');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session');
      setStatus('error');
    }
  }, [code]);

  // Initiate SWIYU verification
  const initiate = useCallback(async () => {
    if (!sessionData) return;

    try {
      const response = await fetch('/api/verify/initiate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refresh_token: sessionData.refresh_token,
          pds_url: sessionData.pds_url,
          success_url: sessionData.success_url,
          error_url: sessionData.error_url,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to initiate verification');
      }

      const data: InitiateResponse = await response.json();
      setVerificationData(data);
      setStatus('pending');
      setMessage('Scan the QR code with your SWIYU wallet');
    } catch (err) {
      setError(String(err));
      setStatus('error');
    }
  }, [sessionData]);

  // Poll for verification status
  const pollStatus = useCallback(async () => {
    if (!verificationData || !sessionData) return;

    try {
      const response = await fetch(
        `/api/verify/status?state_token=${encodeURIComponent(verificationData.state_token)}`
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Status check failed');
      }

      const data: StatusResponse = await response.json();

      if (data.status === 'PENDING') {
        return;
      }

      if (data.status === 'SUCCESS' && data.redirect_url) {
        setStatus('success');
        setMessage('Verification successful! Redirecting...');
        setTimeout(() => {
          window.location.href = data.redirect_url!;
        }, 1500);
        return;
      }

      if ((data.status === 'FAILED' || data.status === 'ERROR') && data.redirect_url) {
        setStatus('error');
        setError(data.message || 'Verification failed');
        setTimeout(() => {
          window.location.href = data.redirect_url!;
        }, 3000);
        return;
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, [verificationData, sessionData]);

  // Exchange code on mount
  useEffect(() => {
    exchangeCode();
  }, [exchangeCode]);

  // Initiate after session loaded
  useEffect(() => {
    if (status === 'initiating' && sessionData) {
      initiate();
    }
  }, [status, sessionData, initiate]);

  // Poll while pending
  useEffect(() => {
    if (status !== 'pending' || !verificationData) return;

    const interval = setInterval(pollStatus, 2000);
    return () => clearInterval(interval);
  }, [status, verificationData, pollStatus]);

  return (
    <>
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold text-center mb-6 text-gray-900">
          Swiss E-ID Verification
        </h1>

        {(status === 'loading' || status === 'initiating') && (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">{message}</p>
          </div>
        )}

        {status === 'pending' && verificationData && (
          <div className="text-center">
            <p className="text-gray-600 mb-4">{message}</p>

            <div className="bg-white p-4 rounded-lg border-2 border-gray-200 inline-block mb-4">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                  verificationData.verification_deeplink
                )}`}
                alt="Scan with SWIYU wallet"
                className="w-48 h-48"
              />
            </div>

            <p className="text-sm text-gray-500 mb-4">
              Or open directly on your mobile device:
            </p>

            <a
              href={verificationData.verification_deeplink}
              className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Open SWIYU Wallet
            </a>

            <div className="mt-6 flex items-center justify-center text-gray-500">
              <div className="animate-pulse flex items-center">
                <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                <span className="text-sm">Waiting for verification...</span>
              </div>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="text-green-600 font-medium">{message}</p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <p className="text-red-600 font-medium mb-2">Verification Failed</p>
            <p className="text-gray-500 text-sm">{error}</p>
            {sessionData?.error_url && (
              <p className="text-gray-400 text-xs mt-4">Redirecting...</p>
            )}
          </div>
        )}
      </div>

      <p className="mt-8 text-sm text-gray-400">
        Powered by SWIYU Swiss E-ID
      </p>
    </>
  );
}

function LoadingFallback() {
  return (
    <>
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold text-center mb-6 text-gray-900">
          Swiss E-ID Verification
        </h1>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
      <p className="mt-8 text-sm text-gray-400">
        Powered by SWIYU Swiss E-ID
      </p>
    </>
  );
}

export default function VerifyPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-50">
      <Suspense fallback={<LoadingFallback />}>
        <VerifyContent />
      </Suspense>
    </main>
  );
}
