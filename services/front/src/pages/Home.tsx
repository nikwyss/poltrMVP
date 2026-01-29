import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useEffect, useState } from 'react';
import { createAppPassword } from '../lib/agent';

export default function Home() {
  const { user, isAuthenticated, logout, loading } = useAuth();
  const navigate = useNavigate();
  const [appPassword, setAppPassword] = useState<{
    name: string;
    password: string;
  } | null>(null);
  const [appPasswordLoading, setAppPasswordLoading] = useState(false);
  const [appPasswordError, setAppPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, loading, navigate]);

  const handleCreateAppPassword = async () => {
    setAppPasswordLoading(true);
    setAppPasswordError(null);
    setAppPassword(null);
    try {
      const result = await createAppPassword();
      setAppPassword({ name: result.name, password: result.password });
    } catch (err) {
      setAppPasswordError(
        err instanceof Error ? err.message : 'Failed to create app password'
      );
    } finally {
      setAppPasswordLoading(false);
    }
  };

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
    navigate('/');
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
          onClick={() => navigate('/proposals')}
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
          onClick={() => navigate('/link-eid')}
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
          swiyu-Verification
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
              ⚠ Copy this password now!
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
