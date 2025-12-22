import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Register() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    handle: '',
    email: '',
    password: '',
    // inviteCode: '',
    pdsUrl: import.meta.env.VITE_PDS_URL || 'https://bsky.social',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Call the PDS account creation endpoint
      const response = await fetch(`${formData.pdsUrl}/xrpc/com.atproto.server.createAccount`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          handle: formData.handle,
          email: formData.email,
          password: formData.password,
        //   inviteCode: formData.inviteCode || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Registration failed' }));
        throw new Error(errorData.message || `Registration failed: ${response.statusText}`);
      }

      const data = await response.json();
      setSuccess(`Account created successfully! DID: ${data.did}`);
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/');
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
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
      padding: '20px',
      backgroundColor: '#f5f5f5'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '40px',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        width: '100%',
        maxWidth: '500px'
      }}>
        <h1 style={{ marginBottom: '10px' }}>Create ATProto Account</h1>
        <p style={{ color: '#666', marginBottom: '30px' }}>
          Register a new account on an ATProto server
        </p>

        <form onSubmit={handleSubmit}>
          {/* <div style={{ marginBottom: '20px' }}>
            <label htmlFor="pdsUrl" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              PDS Server:
            </label>
            <select
              id="pdsUrl"
              value={formData.pdsUrl}
              onChange={(e) => setFormData({ ...formData, pdsUrl: e.target.value })}
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '16px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                backgroundColor: 'white'
              }}
            >
              <option value="https://bsky.social">Bluesky (bsky.social)</option>
              <option value="custom">Custom PDS...</option>
            </select>
          </div> */}

          {/* {formData.pdsUrl === 'custom' && (
            <div style={{ marginBottom: '20px' }}>
              <label htmlFor="customPds" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                Custom PDS URL:
              </label>
              <input
                id="customPds"
                type="url"
                placeholder="https://your-pds.example.com"
                onChange={(e) => setFormData({ ...formData, pdsUrl: e.target.value })}
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
          )} */}

          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="handle" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Handle:
            </label>
            <input
              id="handle"
              type="text"
              value={formData.handle}
              onChange={(e) => setFormData({ ...formData, handle: e.target.value })}
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
            <small style={{ color: '#666', marginTop: '4px', display: 'block' }}>
              Your unique handle on the ATProto network
            </small>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="email" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Email:
            </label>
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="your@email.com"
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

          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="password" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Password:
            </label>
            <input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="••••••••"
              required
              minLength={8}
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '16px',
                border: '1px solid #ccc',
                borderRadius: '4px'
              }}
            />
            <small style={{ color: '#666', marginTop: '4px', display: 'block' }}>
              Minimum 8 characters
            </small>
          </div>

          {/* <div style={{ marginBottom: '20px' }}>
            <label htmlFor="inviteCode" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Invite Code (if required):
            </label>
            <input
              id="inviteCode"
              type="text"
              value={formData.inviteCode}
              onChange={(e) => setFormData({ ...formData, inviteCode: e.target.value })}
              placeholder="bsky-social-xxxxx-xxxxx"
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '16px',
                border: '1px solid #ccc',
                borderRadius: '4px'
              }}
            />
            <small style={{ color: '#666', marginTop: '4px', display: 'block' }}>
              Some servers require an invite code
            </small>
          </div> */}

          {error && (
            <div style={{ 
              color: '#d32f2f', 
              marginBottom: '20px', 
              padding: '12px', 
              backgroundColor: '#ffebee',
              borderRadius: '4px',
              border: '1px solid #ffcdd2'
            }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{ 
              color: '#388e3c', 
              marginBottom: '20px', 
              padding: '12px', 
              backgroundColor: '#e8f5e9',
              borderRadius: '4px',
              border: '1px solid #c8e6c9'
            }}>
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '16px',
              fontWeight: 'bold',
              backgroundColor: loading ? '#ccc' : '#0085ff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: '16px'
            }}
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>

          <div style={{ textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => navigate('/')}
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
              Already have an account? Login
            </button>
          </div>
        </form>
      </div>

      <div style={{
        marginTop: '20px',
        padding: '16px',
        backgroundColor: '#fff3cd',
        borderRadius: '4px',
        maxWidth: '500px',
        border: '1px solid #ffc107'
      }}>
      </div>
    </div>
  );
}
