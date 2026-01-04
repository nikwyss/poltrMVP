import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

export default function VerifyMagicLink() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        const response = await fetch(`${apiUrl}/auth/verify-magic-link`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
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
          did: data.user.email,
          handle: data.user.handle,
          displayName: data.user.displayName,
        });

        setStatus('success');

        // Redirect to home after 2 seconds
        setTimeout(() => {
          navigate('/home');
        }, 2000);

      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Verification failed');
      }
    };

    verifyToken();
  }, [searchParams, navigate, login]);

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
            ⏳
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
            ✅
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
            ❌
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
            onClick={() => navigate('/')}
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

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
