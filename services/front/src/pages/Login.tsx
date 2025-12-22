import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOAuthClient } from '../lib/oauthClient';

export default function Login() {
  const navigate = useNavigate();
  const [handle, setHandle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const client = await getOAuthClient();
      
      // Initiate login - this will redirect to Poltr
      await client.signIn(handle, {
        signal: new AbortController().signal,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initiate login');
      setLoading(false);
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
      <h1>atproto-Login</h1>
      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="handle" style={{ display: 'block', marginBottom: '8px' }}>
            Enter your Atproto handle:
          </label>
          <input
            id="handle"
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder={`username.${import.meta.env.VITE_PDS_URL_SHORT || 'poltr.info'}`}
            required
            disabled={loading}
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '16px',
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
          />
        </div>
        {error && (
          <div style={{ 
            color: 'red', 
            marginBottom: '20px', 
            padding: '10px', 
            background: '#ffe6e6',
            borderRadius: '4px'
          }}>
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '16px',
            backgroundColor: loading ? '#ccc' : '#0085ff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            marginBottom: '16px'
          }}
        >
          {loading ? 'Resolving...' : 'Login'}
        </button>
        
        <div style={{ textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => navigate('/register')}
            disabled={loading}
            style={{
              background: 'none',
              border: 'none',
              color: '#0085ff',
              cursor: 'pointer',
              textDecoration: 'underline',
              fontSize: '14px'
            }}
          >
            Don't have an account? Register
          </button>
        </div>
      </form>
    </div>
  );
}
