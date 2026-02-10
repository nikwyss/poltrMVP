-- Create auth_pending_logins table for login confirmation
CREATE TABLE IF NOT EXISTS auth_pending_logins (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_pending_logins_token ON auth_pending_logins(token);
CREATE INDEX IF NOT EXISTS idx_auth_pending_logins_email ON auth_pending_logins(email);
CREATE INDEX IF NOT EXISTS idx_auth_pending_logins_expires_at ON auth_pending_logins(expires_at);
