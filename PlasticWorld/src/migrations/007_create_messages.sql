-- Migration: 007_create_messages.sql
-- Description: Create messages table for E2E encrypted messaging
-- Created: 2026-01-09

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    encrypted_content BYTEA NOT NULL,
    encrypted_key BYTEA NOT NULL,
    message_type message_type NOT NULL DEFAULT 'text',
    media_url TEXT,
    media_size_bytes INTEGER,
    status message_status NOT NULL DEFAULT 'sent',
    sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    reply_to_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    is_edited BOOLEAN NOT NULL DEFAULT false,
    edited_at TIMESTAMP WITH TIME ZONE,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Prevent self-messaging
    CONSTRAINT no_self_message CHECK (sender_id != recipient_id),
    
    -- Media validation
    CONSTRAINT media_validation CHECK (
        (message_type IN ('text', 'system') AND media_url IS NULL AND media_size_bytes IS NULL) OR
        (message_type NOT IN ('text', 'system') AND media_url IS NOT NULL)
    )
);

-- Indexes for performance
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_recipient_id ON messages(recipient_id);
CREATE INDEX idx_messages_sender_recipient ON messages(sender_id, recipient_id);
CREATE INDEX idx_messages_recipient_status ON messages(recipient_id, status) WHERE is_deleted = false;
CREATE INDEX idx_messages_status ON messages(status);
CREATE INDEX idx_messages_sent_at ON messages(sent_at DESC);
CREATE INDEX idx_messages_reply_to ON messages(reply_to_message_id) WHERE reply_to_message_id IS NOT NULL;
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_is_deleted ON messages(is_deleted) WHERE is_deleted = false;

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_messages_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    -- Set delivered_at when status changes to delivered
    IF OLD.status != 'delivered' AND NEW.status = 'delivered' THEN
        NEW.delivered_at = CURRENT_TIMESTAMP;
    END IF;
    
    -- Set read_at when status changes to read
    IF OLD.status != 'read' AND NEW.status = 'read' THEN
        NEW.read_at = CURRENT_TIMESTAMP;
    END IF;
    
    -- Set edited_at when message is edited
    IF NEW.is_edited = true AND (OLD.is_edited = false OR OLD.is_edited IS NULL) THEN
        NEW.edited_at = CURRENT_TIMESTAMP;
    END IF;
    
    -- Set deleted_at when message is deleted
    IF NEW.is_deleted = true AND (OLD.is_deleted = false OR OLD.is_deleted IS NULL) THEN
        NEW.deleted_at = CURRENT_TIMESTAMP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_messages_timestamps
    BEFORE UPDATE ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_messages_timestamps();

-- Comments
COMMENT ON TABLE messages IS 'Stores E2E encrypted messages between users';
COMMENT ON COLUMN messages.encrypted_content IS 'End-to-end encrypted message content';
COMMENT ON COLUMN messages.encrypted_key IS 'Per-message encryption key';
COMMENT ON COLUMN messages.status IS 'Message delivery status (sent, delivered, read)';
COMMENT ON COLUMN messages.reply_to_message_id IS 'Reference to parent message for threading';
