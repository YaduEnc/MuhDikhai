-- Migration: 014_create_message_reactions.sql
-- Description: Create message_reactions table for real-time emoji reactions
-- Created: 2026-03-04

CREATE TABLE message_reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint: one emoji per user per message
    CONSTRAINT unique_user_message_emoji UNIQUE (message_id, user_id, emoji)
);

-- Indexes for performance
CREATE INDEX idx_message_reactions_message_id ON message_reactions(message_id);
CREATE INDEX idx_message_reactions_user_id ON message_reactions(user_id);

-- Comments
COMMENT ON TABLE message_reactions IS 'Stores user reactions/emojis for specific messages';
COMMENT ON COLUMN message_reactions.emoji IS 'The emoji character or string used as a reaction';
