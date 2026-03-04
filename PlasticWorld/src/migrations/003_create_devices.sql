-- Migration: 003_create_devices.sql
-- Description: Create devices table for multi-device support
-- Created: 2026-01-09

CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_name VARCHAR(100) NOT NULL,
    device_type device_type NOT NULL,
    device_token VARCHAR(255),
    user_agent TEXT,
    ip_address INET,
    last_active TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT device_name_length CHECK (char_length(device_name) >= 1 AND char_length(device_name) <= 100)
);

-- Indexes
CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE INDEX idx_devices_user_active ON devices(user_id, is_active) WHERE is_active = true;
CREATE INDEX idx_devices_device_type ON devices(device_type);
CREATE INDEX idx_devices_last_active ON devices(last_active);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_devices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_devices_updated_at
    BEFORE UPDATE ON devices
    FOR EACH ROW
    EXECUTE FUNCTION update_devices_updated_at();

-- Comments
COMMENT ON TABLE devices IS 'Stores user device information for multi-device support';
COMMENT ON COLUMN devices.device_token IS 'FCM/APNS push notification token';
COMMENT ON COLUMN devices.is_active IS 'Whether the device is currently active';
