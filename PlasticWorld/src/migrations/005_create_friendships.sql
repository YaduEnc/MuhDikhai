-- Migration: 005_create_friendships.sql
-- Description: Create friendships table for friend request management
-- Created: 2026-01-09

CREATE TABLE friendships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status friendship_status NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Prevent self-friendship
    CONSTRAINT no_self_friendship CHECK (requester_id != addressee_id),
    
    -- Unique constraint: one friendship record per pair
    CONSTRAINT unique_friendship_pair UNIQUE (requester_id, addressee_id)
);

-- Indexes for performance
CREATE INDEX idx_friendships_requester_id ON friendships(requester_id);
CREATE INDEX idx_friendships_addressee_id ON friendships(addressee_id);
CREATE INDEX idx_friendships_status ON friendships(status);
CREATE INDEX idx_friendships_requester_status ON friendships(requester_id, status);
CREATE INDEX idx_friendships_addressee_status ON friendships(addressee_id, status);
CREATE INDEX idx_friendships_accepted ON friendships(requester_id, addressee_id) WHERE status = 'accepted';

-- Trigger to update updated_at and responded_at
CREATE OR REPLACE FUNCTION update_friendships_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    
    -- Set responded_at when status changes from pending
    IF OLD.status = 'pending' AND NEW.status != 'pending' THEN
        NEW.responded_at = CURRENT_TIMESTAMP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_friendships_timestamps
    BEFORE UPDATE ON friendships
    FOR EACH ROW
    EXECUTE FUNCTION update_friendships_timestamps();

-- Comments
COMMENT ON TABLE friendships IS 'Manages friend requests and friendships between users';
COMMENT ON COLUMN friendships.requester_id IS 'User who sent the friend request';
COMMENT ON COLUMN friendships.addressee_id IS 'User who received the friend request';
COMMENT ON COLUMN friendships.status IS 'Current status of the friendship (pending, accepted, denied, blocked)';
COMMENT ON COLUMN friendships.responded_at IS 'Timestamp when request was accepted or denied';
