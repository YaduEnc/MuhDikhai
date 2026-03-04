-- Migration: 006_create_blocks.sql
-- Description: Create blocks table for user blocking functionality
-- Created: 2026-01-09

CREATE TABLE blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Prevent self-block
    CONSTRAINT no_self_block CHECK (blocker_id != blocked_id),
    
    -- Unique constraint: can't block the same user twice
    CONSTRAINT unique_block_pair UNIQUE (blocker_id, blocked_id)
);

-- Indexes for performance
CREATE INDEX idx_blocks_blocker_id ON blocks(blocker_id);
CREATE INDEX idx_blocks_blocked_id ON blocks(blocked_id);
CREATE INDEX idx_blocks_created_at ON blocks(created_at);

-- Comments
COMMENT ON TABLE blocks IS 'Stores user blocking relationships';
COMMENT ON COLUMN blocks.blocker_id IS 'User who performed the block';
COMMENT ON COLUMN blocks.blocked_id IS 'User who was blocked';
COMMENT ON COLUMN blocks.reason IS 'Optional reason for blocking';
