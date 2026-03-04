-- Migration: 008_create_message_receipts.sql
-- Description: Create message_receipts table for delivery acknowledgments
-- Created: 2026-01-09

CREATE TABLE message_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receipt_type receipt_type NOT NULL,
    received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint: one receipt per user per type per message
    CONSTRAINT unique_receipt UNIQUE (message_id, user_id, receipt_type)
);

-- Indexes for performance
CREATE INDEX idx_message_receipts_message_id ON message_receipts(message_id);
CREATE INDEX idx_message_receipts_user_id ON message_receipts(user_id);
CREATE INDEX idx_message_receipts_type ON message_receipts(receipt_type);
CREATE INDEX idx_message_receipts_received_at ON message_receipts(received_at);

-- Comments
COMMENT ON TABLE message_receipts IS 'Tracks message delivery and read receipts';
COMMENT ON COLUMN message_receipts.receipt_type IS 'Type of receipt (delivered, read, played)';
