-- Migration: 010_create_encryption_keys.sql
-- Description: Create encryption_keys table for Signal Protocol key storage
-- Created: 2026-01-09

CREATE TABLE encryption_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    identity_key_public BYTEA NOT NULL,
    signed_prekey_public BYTEA NOT NULL,
    signed_prekey_signature BYTEA NOT NULL,
    one_time_prekeys JSONB NOT NULL DEFAULT '[]'::jsonb,
    prekey_count INTEGER NOT NULL DEFAULT 0,
    key_created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    key_expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint: one keyset per device
    CONSTRAINT unique_user_device_keys UNIQUE (user_id, device_id),
    
    -- Validation
    CONSTRAINT prekey_count_non_negative CHECK (prekey_count >= 0)
);

-- Indexes for performance
CREATE INDEX idx_encryption_keys_user_id ON encryption_keys(user_id);
CREATE INDEX idx_encryption_keys_device_id ON encryption_keys(device_id);
CREATE INDEX idx_encryption_keys_user_active ON encryption_keys(user_id, is_active) WHERE is_active = true;
CREATE INDEX idx_encryption_keys_expires_at ON encryption_keys(key_expires_at) WHERE key_expires_at IS NOT NULL;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_encryption_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_encryption_keys_updated_at
    BEFORE UPDATE ON encryption_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_encryption_keys_updated_at();

-- Comments
COMMENT ON TABLE encryption_keys IS 'Stores Signal Protocol encryption keys for E2E messaging';
COMMENT ON COLUMN encryption_keys.identity_key_public IS 'X25519 identity public key';
COMMENT ON COLUMN encryption_keys.signed_prekey_public IS 'Signed prekey public key';
COMMENT ON COLUMN encryption_keys.one_time_prekeys IS 'Array of one-time prekeys (JSON)';
COMMENT ON COLUMN encryption_keys.prekey_count IS 'Number of remaining one-time prekeys';
COMMENT ON COLUMN encryption_keys.key_expires_at IS 'Key rotation expiration date';
