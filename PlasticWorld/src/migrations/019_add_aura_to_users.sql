-- Migration: 019_add_aura_to_users.sql
-- Description: Add aura points to users and create vibe check history
-- Created: 2026-03-07

-- Add aura_points to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS aura_points INTEGER NOT NULL DEFAULT 50; -- Start with some base "neutral" aura

-- Create vibe_check_history table to track and limit voting
CREATE TABLE IF NOT EXISTS vibe_check_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    voter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id VARCHAR(255) NOT NULL,
    vibe VARCHAR(10) NOT NULL CHECK (vibe IN ('warm', 'cold')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Limit: One vote per match-pair per room
    CONSTRAINT unique_vibe_check UNIQUE (voter_id, target_id, room_id),
    CONSTRAINT different_users_vibe CHECK (voter_id != target_id)
);

-- Indexes for performance
CREATE INDEX idx_vibe_check_target ON vibe_check_history(target_id);
CREATE INDEX idx_vibe_check_voter ON vibe_check_history(voter_id);

-- Comment
COMMENT ON COLUMN users.aura_points IS 'Social currency points gained from positive interactions';
COMMENT ON TABLE vibe_check_history IS 'Stores ratings given at the end of random chat sessions';
