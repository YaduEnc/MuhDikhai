-- Migration: 009_create_message_media.sql
-- Description: Create message_media table for media attachments
-- Created: 2026-01-09

CREATE TABLE message_media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    media_type VARCHAR(100) NOT NULL,
    storage_url TEXT NOT NULL,
    thumbnail_url TEXT,
    file_size_bytes INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    duration_seconds INTEGER,
    encryption_key BYTEA,
    checksum_sha256 VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Validation constraints
    CONSTRAINT file_size_positive CHECK (file_size_bytes > 0),
    CONSTRAINT width_positive CHECK (width IS NULL OR width > 0),
    CONSTRAINT height_positive CHECK (height IS NULL OR height > 0),
    CONSTRAINT duration_positive CHECK (duration_seconds IS NULL OR duration_seconds > 0)
);

-- Indexes for performance
CREATE INDEX idx_message_media_message_id ON message_media(message_id);
CREATE INDEX idx_message_media_media_type ON message_media(media_type);
CREATE INDEX idx_message_media_checksum ON message_media(checksum_sha256);
CREATE INDEX idx_message_media_created_at ON message_media(created_at);

-- Comments
COMMENT ON TABLE message_media IS 'Stores metadata for media attachments in messages';
COMMENT ON COLUMN message_media.media_type IS 'MIME type (e.g., image/jpeg, video/mp4)';
COMMENT ON COLUMN message_media.storage_url IS 'URL to media file in S3/CDN';
COMMENT ON COLUMN message_media.encryption_key IS 'Encryption key for media file';
COMMENT ON COLUMN message_media.checksum_sha256 IS 'SHA256 hash for file integrity verification';
