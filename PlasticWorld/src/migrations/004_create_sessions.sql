-- Migration: 004_create_sessions.sql
-- Description: Create sessions table for JWT token management
-- Created: 2026-01-09

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    access_token_hash VARCHAR(255) NOT NULL,
    refresh_token_hash VARCHAR(255) NOT NULL,
    access_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    refresh_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_user_active ON sessions(user_id, is_active) WHERE is_active = true;
CREATE INDEX idx_sessions_device_id ON sessions(device_id);
CREATE INDEX idx_sessions_access_token_hash ON sessions(access_token_hash);
CREATE INDEX idx_sessions_refresh_token_hash ON sessions(refresh_token_hash);
CREATE INDEX idx_sessions_access_expires_at ON sessions(access_expires_at) WHERE is_active = true;
CREATE INDEX idx_sessions_refresh_expires_at ON sessions(refresh_expires_at) WHERE is_active = true;

-- Trigger to update last_used_at
CREATE OR REPLACE FUNCTION update_sessions_last_used_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_used_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_sessions_last_used_at
    BEFORE UPDATE ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_sessions_last_used_at();

-- Comments
COMMENT ON TABLE sessions IS 'Stores active user sessions with JWT token hashes';
COMMENT ON COLUMN sessions.access_token_hash IS 'Hashed access token (15 minutes expiry)';
COMMENT ON COLUMN sessions.refresh_token_hash IS 'Hashed refresh token (7 days expiry)';
COMMENT ON COLUMN sessions.is_active IS 'Whether the session is currently active';
