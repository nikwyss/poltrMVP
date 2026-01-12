import { useLocation, useNavigate } from 'react-router-dom';

export default function MagicLinkSent() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email || 'your email';

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
          ✉️
        </div>
        <h1 style={{ marginBottom: '20px' }}>Check your email!</h1>
        <p style={{ 
          fontSize: '16px', 
          color: '#666',
          marginBottom: '10px'
        }}>
          We've sent a magic link to:
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
          onClick={() => navigate('/')}
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
