-- Migration: 021_create_havelis.sql
-- Description: Create Haveli (group chat rooms) system
-- Created: 2026-03-24

-- Create haveli privacy enum
DO $$ BEGIN
  CREATE TYPE haveli_privacy AS ENUM ('public', 'invite');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create haveli member role enum
DO $$ BEGIN
  CREATE TYPE haveli_role AS ENUM ('admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Main havelis table
CREATE TABLE IF NOT EXISTS havelis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(60) NOT NULL,
    description VARCHAR(300),
    theme_id VARCHAR(50) NOT NULL DEFAULT 'midnight_terrace',
    privacy_type haveli_privacy NOT NULL DEFAULT 'public',
    invite_code VARCHAR(12) NOT NULL UNIQUE,
    is_locked BOOLEAN NOT NULL DEFAULT false,
    max_members INTEGER NOT NULL DEFAULT 50,
    pinned_message TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Haveli members junction table
CREATE TABLE IF NOT EXISTS haveli_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    haveli_id UUID NOT NULL REFERENCES havelis(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role haveli_role NOT NULL DEFAULT 'member',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_haveli_member UNIQUE (haveli_id, user_id)
);

-- Haveli messages table (ephemeral by design — can be cleared)
CREATE TABLE IF NOT EXISTS haveli_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    haveli_id UUID NOT NULL REFERENCES havelis(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    message_type VARCHAR(20) NOT NULL DEFAULT 'text',
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_havelis_creator ON havelis(creator_id);
CREATE INDEX IF NOT EXISTS idx_havelis_privacy ON havelis(privacy_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_havelis_invite_code ON havelis(invite_code);
CREATE INDEX IF NOT EXISTS idx_haveli_members_haveli ON haveli_members(haveli_id);
CREATE INDEX IF NOT EXISTS idx_haveli_members_user ON haveli_members(user_id);
CREATE INDEX IF NOT EXISTS idx_haveli_messages_haveli ON haveli_messages(haveli_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_haveli_messages_sender ON haveli_messages(sender_id);

-- Comments
COMMENT ON TABLE havelis IS 'Group chat rooms (Havelis) with admin controls and theming';
COMMENT ON TABLE haveli_members IS 'Membership records for Haveli rooms';
COMMENT ON TABLE haveli_messages IS 'Ephemeral chat messages within Haveli rooms';
COMMENT ON COLUMN havelis.theme_id IS 'Visual theme identifier e.g. midnight_terrace, monsoon_night';
COMMENT ON COLUMN havelis.invite_code IS 'Unique short code for invite-only rooms';
COMMENT ON COLUMN havelis.is_locked IS 'When true, no new members can join';
