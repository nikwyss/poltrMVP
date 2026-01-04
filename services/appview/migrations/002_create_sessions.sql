-- Create sessions table for secure session management
CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    session_token VARCHAR(128) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL,
    user_data JSONB,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    last_accessed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(email);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
