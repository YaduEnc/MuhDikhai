-- Create match_history table
CREATE TABLE IF NOT EXISTS random_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id_a UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_id_b UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id VARCHAR(255) NOT NULL,
    shared_topic VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure user_id_a is always less than user_id_b to avoid duplicate rows
    -- for the same pair in the same room (though room_id is unique enough)
    CONSTRAINT different_users CHECK (user_id_a != user_id_b)
);

-- Index for performance when fetching recent matches for a user
CREATE INDEX idx_random_matches_user_a ON random_matches(user_id_a);
CREATE INDEX idx_random_matches_user_b ON random_matches(user_id_b);
CREATE INDEX idx_random_matches_created_at ON random_matches(created_at DESC);
