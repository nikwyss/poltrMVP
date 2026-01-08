import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import { initiateVerification, pollVerification } from '../lib/agent';

export default function LinkEID() {
  const { user, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'pending' | 'completed' | 'failed' | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const qrCodeRef = useRef<HTMLDivElement>(null);
  const pollingIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, loading, navigate]);

  useEffect(() => {
    if (verificationUrl && qrCodeRef.current) {
      // Clear previous QR code
      qrCodeRef.current.innerHTML = '';
      
      // Generate new QR code as canvas
      const canvas = document.createElement('canvas');
      QRCode.toCanvas(canvas, verificationUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      }).then(() => {
        qrCodeRef.current?.appendChild(canvas);
      }).catch((err) => {
        console.error('QR code generation error:', err);
      });
    }
  }, [verificationUrl]);

  // Polling effect
  useEffect(() => {
    if (verificationId && status === 'pending') {
      const pollVerificationStatus = async () => {
        try {
          // Check if expired
          if (expiresAt && new Date(expiresAt) < new Date()) {
            setStatus('failed');
            setError('Verification expired');
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
            }
            return;
          }

          const data = await pollVerification(verificationId);
          setStatus(data.status);

          if (data.status === 'completed' || data.status === 'failed') {
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
            }
          }
        } catch (err) {
          console.error('Polling error:', err);
        }
      };

      // Start polling every 2 seconds
      pollingIntervalRef.current = window.setInterval(pollVerificationStatus, 2000);

      return () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
      };
    }
  }, [verificationId, status, expiresAt]);

  
  const startVerification = async () => {
    setQrLoading(true);
    setError(null);
    try {
      const data = await initiateVerification();
      setVerificationUrl(data.verification_url);
      setVerificationId(data.verification_id);
      setExpiresAt(data.expires_at);
      setStatus('pending');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setQrLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'sans-serif'}}>
        Loading...
      </div>
    );
  }

  if (!user) return null;

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      padding: '20px'
    }}>
      <h1>Link Profile with E-ID</h1>
      
      <div style={{ 
        marginTop: '30px', 
        padding: '30px', 
        background: '#f5f5f5', 
        borderRadius: '8px',
        maxWidth: '600px',
        textAlign: 'center'
      }}>
        <p style={{ marginBottom: '20px' }}>
          Link your profile with your Swiss E-ID to verify your identity.
        </p>
        
        {!verificationUrl && !qrLoading && (
          <button
            onClick={startVerification}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              backgroundColor: '#0085ff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginTop: '20px'
            }}
          >
            Start E-ID Verification
          </button>
        )}

        {qrLoading && <p>Generating QR code...</p>}

        {error && (
          <p style={{ color: 'red', marginTop: '20px' }}>{error}</p>
        )}

        {status === 'completed' && (
          <div style={{ marginTop: '20px', padding: '20px', background: '#d4edda', borderRadius: '8px' }}>
            <p style={{ color: '#155724', fontWeight: 'bold' }}>
              ✓ Verification completed successfully!
            </p>
          </div>
        )}

        {status === 'failed' && (
          <div style={{ marginTop: '20px', padding: '20px', background: '#f8d7da', borderRadius: '8px' }}>
            <p style={{ color: '#721c24', fontWeight: 'bold' }}>
              ✗ Verification failed or expired
            </p>
          </div>
        )}

        {verificationUrl && status === 'pending' && (
          <div style={{ marginTop: '20px' }}>
            <p style={{ marginBottom: '10px', fontWeight: 'bold' }}>
              Scan this QR code with your SWIYU app:
            </p>
            <div 
              ref={qrCodeRef}
              style={{ 
                display: 'flex', 
                justifyContent: 'center',
                padding: '20px',
                background: 'white',
                borderRadius: '8px'
              }}
            />
            <p style={{ 
              marginTop: '15px', 
              fontSize: '12px', 
              color: '#666',
              wordBreak: 'break-all'
            }}>
              {verificationUrl}
            </p>
            <p style={{ marginTop: '10px', fontSize: '14px', color: '#0085ff' }}>
              ⏳ Waiting for verification...
            </p>
          </div>
        )}
      </div>

      <button
        onClick={() => navigate('/home')}
        style={{
          marginTop: '30px',
          padding: '10px 20px',
          fontSize: '14px',
          backgroundColor: '#666',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Back to Home
      </button>
    </div>
  );
}
