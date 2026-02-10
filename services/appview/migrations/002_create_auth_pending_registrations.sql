-- Create auth_pending_registrations table for registration confirmation
CREATE TABLE IF NOT EXISTS auth_pending_registrations (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_pending_registrations_token ON auth_pending_registrations(token);
CREATE INDEX IF NOT EXISTS idx_auth_pending_registrations_email ON auth_pending_registrations(email);
CREATE INDEX IF NOT EXISTS idx_auth_pending_registrations_expires_at ON auth_pending_registrations(expires_at);
