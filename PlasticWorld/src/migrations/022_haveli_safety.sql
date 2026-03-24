-- Migration: 022_haveli_safety.sql
-- Description: Add bans table for Haveli rooms
-- Created: 2026-03-24

-- Haveli bans table (persist kicks so banned users can't rejoin)
CREATE TABLE IF NOT EXISTS haveli_bans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    haveli_id UUID NOT NULL REFERENCES havelis(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    banned_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_haveli_ban UNIQUE (haveli_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_haveli_bans_haveli ON haveli_bans(haveli_id);
CREATE INDEX IF NOT EXISTS idx_haveli_bans_user ON haveli_bans(user_id);

COMMENT ON TABLE haveli_bans IS 'Persistent ban records so kicked users cannot rejoin a Haveli';
