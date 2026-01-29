'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { startLogin } from '../lib/oauthClient';

interface VerificationRecord {
  verifiedAt: string;
  eidHash: string;
  eidIssuer: string;
  verifiedBy: string;
}

interface VerificationStatus {
  verified: boolean;
  record?: VerificationRecord;
  reason?: string;
}

function LoginForm() {
  const [handle, setHandle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) {
      setError('Please enter your handle');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await startLogin(handle.trim());
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'Failed to start login');
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-lg w-full bg-white rounded-lg shadow-lg p-8">
      <h1 className="text-3xl font-bold mb-4 text-gray-900 text-center">EID-PROTO</h1>
      <p className="text-lg text-gray-600 mb-6 text-center">
        Swiss E-ID to ATProto Verification Bridge
      </p>

      <div className="bg-blue-50 rounded-lg p-6 mb-6">
        <h2 className="font-semibold text-blue-900 mb-2">What is this?</h2>
        <p className="text-blue-800 text-sm">
          This service verifies ATProto accounts using Swiss E-ID (SWIYU). It writes a
          signed verification record to your PDS, proving you are a Swiss resident.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="handle" className="block text-sm font-medium text-gray-700 mb-1">
            Your ATProto Handle
          </label>
          <input
            type="text"
            id="handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="username.bsky.social"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
            disabled={isLoading}
          />
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Redirecting...' : 'Login with ATProto'}
        </button>
      </form>
    </div>
  );
}

function VerifiedStatus({ record }: { record: VerificationRecord }) {
  const { user, logout } = useAuth();

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const truncateHash = (hash: string) => {
    if (hash.length <= 16) return hash;
    return `${hash.substring(0, 8)}...${hash.substring(hash.length - 8)}`;
  };

  return (
    <div className="max-w-lg w-full bg-white rounded-lg shadow-lg p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">EID-PROTO</h1>
        <button
          onClick={logout}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Logout
        </button>
      </div>

      <div className="text-center mb-6">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-10 h-10 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-green-700 mb-1">Verified</h2>
        <p className="text-gray-600">@{user?.handle}</p>
      </div>

      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Verified At</p>
          <p className="text-gray-900 font-medium">{formatDate(record.verifiedAt)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">E-ID Hash</p>
          <p className="text-gray-900 font-mono text-sm">{truncateHash(record.eidHash)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Issuer</p>
          <p className="text-gray-900">{record.eidIssuer}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Verified By</p>
          <p className="text-gray-900 text-sm break-all">{record.verifiedBy}</p>
        </div>
      </div>
    </div>
  );
}

interface InitiateResponse {
  state_token: string;
  verification_id: string;
  verification_url: string;
  verification_deeplink: string;
  expires_at: string;
}

interface VerificationRecordData {
  $type: string;
  eidHash: string;
  eidIssuer: string;
  verifiedBy: string;
  verifiedAt: string;
  signature: string;
}

interface StatusResponse {
  status: 'PENDING' | 'SUCCESS' | 'SUCCESS_PENDING_WRITE' | 'FAILED' | 'ERROR';
  redirect_url?: string;
  message?: string;
  record?: VerificationRecordData;
  did?: string;
  pds_url?: string;
}

type VerificationState = 'idle' | 'initiating' | 'pending' | 'success' | 'error';

function NotVerifiedStatus({ onVerificationComplete }: { onVerificationComplete: () => void }) {
  const { user, session, logout } = useAuth();
  const [verificationState, setVerificationState] = useState<VerificationState>('idle');
  const [verificationData, setVerificationData] = useState<InitiateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleStartVerification = useCallback(async () => {
    if (!session || !user) return;

    setVerificationState('initiating');
    setError(null);

    try {
      // Get token info to extract PDS URL (aud field)
      const tokenInfo = await session.getTokenInfo();
      const pdsUrl = tokenInfo.aud || 'https://bsky.social';

      // Call session-based initiate API (no tokens needed, trusts OAuth session)
      const response = await fetch('/api/verify/initiate-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          did: user.did,
          pds_url: pdsUrl.replace(/^https?:\/\//, ''),
          success_url: window.location.origin,
          error_url: window.location.origin,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to initiate verification');
      }

      const data: InitiateResponse = await response.json();
      setVerificationData(data);
      setVerificationState('pending');
    } catch (err) {
      console.error('Failed to start verification:', err);
      setError(err instanceof Error ? err.message : 'Failed to start verification');
      setVerificationState('error');
    }
  }, [session, user]);

  const writeVerificationRecord = useCallback(async (record: VerificationRecordData) => {
    if (!session || !user) throw new Error('No session');

    const writeResponse = await session.fetchHandler(
      '/xrpc/com.atproto.repo.putRecord',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          repo: user.did,
          collection: 'info.poltr.eidproto.verification',
          rkey: 'self',
          record,
        }),
      }
    );

    if (!writeResponse.ok) {
      const errText = await writeResponse.text();
      throw new Error(`Failed to write record: ${errText}`);
    }

    return true;
  }, [session, user]);

  const pollStatus = useCallback(async () => {
    if (!verificationData) return;

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

      if (data.status === 'SUCCESS') {
        setVerificationState('success');
        setTimeout(() => {
          onVerificationComplete();
        }, 1500);
        return;
      }

      if (data.status === 'SUCCESS_PENDING_WRITE' && data.record) {
        // Write the server-signed record using OAuth session
        try {
          await writeVerificationRecord(data.record);
          setVerificationState('success');
          setTimeout(() => {
            onVerificationComplete();
          }, 1500);
        } catch (writeErr) {
          console.error('Failed to write record:', writeErr);
          setVerificationState('error');
          setError(writeErr instanceof Error ? writeErr.message : 'Failed to write verification record');
        }
        return;
      }

      if (data.status === 'FAILED' || data.status === 'ERROR') {
        setVerificationState('error');
        setError(data.message || 'Verification failed');
        return;
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, [verificationData, onVerificationComplete, writeVerificationRecord]);

  useEffect(() => {
    if (verificationState !== 'pending' || !verificationData) return;

    const interval = setInterval(pollStatus, 2000);
    return () => clearInterval(interval);
  }, [verificationState, verificationData, pollStatus]);

  // Pending state - show QR code
  if (verificationState === 'pending' && verificationData) {
    return (
      <div className="max-w-lg w-full bg-white rounded-lg shadow-lg p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">EID-PROTO</h1>
          <button
            onClick={logout}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>

        <div className="text-center">
          <p className="text-gray-600 mb-4">Scan the QR code with your SWIYU wallet</p>

          <div className="bg-white p-4 rounded-lg border-2 border-gray-200 inline-block mb-4">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                verificationData.verification_deeplink
              )}`}
              alt="Scan with SWIYU wallet"
              className="w-48 h-48"
            />
          </div>

          <p className="text-sm text-gray-500 mb-4">Or open directly on your mobile device:</p>

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
      </div>
    );
  }

  // Success state
  if (verificationState === 'success') {
    return (
      <div className="max-w-lg w-full bg-white rounded-lg shadow-lg p-8">
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
          <p className="text-green-600 font-medium">Verification successful!</p>
          <p className="text-gray-500 text-sm mt-2">Refreshing...</p>
        </div>
      </div>
    );
  }

  // Idle or error state
  return (
    <div className="max-w-lg w-full bg-white rounded-lg shadow-lg p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">EID-PROTO</h1>
        <button
          onClick={logout}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Logout
        </button>
      </div>

      <div className="text-center mb-6">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-10 h-10 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-700 mb-1">Not Verified</h2>
        <p className="text-gray-600">@{user?.handle}</p>
      </div>

      {error && (
        <div className="bg-red-50 rounded-lg p-4 mb-6">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {!error && (
        <div className="bg-blue-50 rounded-lg p-4 mb-6">
          <p className="text-blue-800 text-sm">
            Your account is not yet verified with Swiss E-ID. Complete the verification
            process to prove you are a Swiss resident.
          </p>
        </div>
      )}

      <button
        onClick={handleStartVerification}
        disabled={verificationState === 'initiating'}
        className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {verificationState === 'initiating' ? 'Starting...' : error ? 'Try Again' : 'Start Verification'}
      </button>
    </div>
  );
}

function InvalidRecordStatus({
  reason,
  onDeleted
}: {
  reason: string;
  onDeleted: () => void;
}) {
  const { user, session, logout } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!session || !user) return;

    setIsDeleting(true);
    setError(null);

    try {
      const response = await session.fetchHandler(
        '/xrpc/com.atproto.repo.deleteRecord',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            repo: user.did,
            collection: 'info.poltr.eidproto.verification',
            rkey: 'self',
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to delete: ${errText}`);
      }

      onDeleted();
    } catch (err) {
      console.error('Delete error:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete record');
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-lg w-full bg-white rounded-lg shadow-lg p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">EID-PROTO</h1>
        <button
          onClick={logout}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Logout
        </button>
      </div>

      <div className="text-center mb-6">
        <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-10 h-10 text-yellow-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-yellow-700 mb-1">Invalid Record</h2>
        <p className="text-gray-600">@{user?.handle}</p>
      </div>

      <div className="bg-yellow-50 rounded-lg p-4 mb-6">
        <p className="text-yellow-800 text-sm">
          Your verification record exists but is invalid: <strong>{reason}</strong>
        </p>
        <p className="text-yellow-700 text-sm mt-2">
          Delete the invalid record and re-verify to get a properly signed verification.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 rounded-lg p-4 mb-6">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      <button
        onClick={handleDelete}
        disabled={isDeleting}
        className="w-full bg-red-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isDeleting ? 'Deleting...' : 'Delete Invalid Record'}
      </button>
    </div>
  );
}

function AuthenticatedHome() {
  const { user } = useAuth();
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchVerificationStatus = useCallback(async () => {
    if (!user) return;

    try {
      const response = await fetch(`/api/verify/record?did=${encodeURIComponent(user.did)}`);
      const data = await response.json();
      setStatus(data);
    } catch (err) {
      console.error('Failed to fetch verification status:', err);
      setStatus({ verified: false });
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchVerificationStatus();
  }, [fetchVerificationStatus]);

  const handleVerificationComplete = useCallback(() => {
    setIsLoading(true);
    fetchVerificationStatus();
  }, [fetchVerificationStatus]);

  if (isLoading) {
    return (
      <div className="max-w-lg w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading verification status...</p>
      </div>
    );
  }

  if (status?.verified && status.record) {
    return <VerifiedStatus record={status.record} />;
  }

  // Record exists but is invalid (missing/invalid signature)
  if (!status?.verified && status?.record && status?.reason) {
    return <InvalidRecordStatus reason={status.reason} onDeleted={handleVerificationComplete} />;
  }

  return <NotVerifiedStatus onVerificationComplete={handleVerificationComplete} />;
}

export default function Home() {
  const { isAuthenticated } = useAuth();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-50">
      {isAuthenticated ? <AuthenticatedHome /> : <LoginForm />}

      <p className="mt-8 text-sm text-gray-400">Powered by SWIYU Swiss E-ID</p>
    </main>
  );
}
