-- Migration: 002_create_users.sql
-- Description: Create users table with all constraints and indexes
-- Created: 2026-01-09

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firebase_uid VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(30) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone_number VARCHAR(20) UNIQUE,
    name VARCHAR(100) NOT NULL,
    age INTEGER NOT NULL CHECK (age >= 13),
    profile_picture_url TEXT,
    bio VARCHAR(500),
    status user_status NOT NULL DEFAULT 'offline',
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT username_length CHECK (char_length(username) >= 3 AND char_length(username) <= 30),
    CONSTRAINT name_length CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
    CONSTRAINT phone_format CHECK (phone_number IS NULL OR phone_number ~ '^\+[1-9]\d{1,14}$')
);

-- Indexes for performance
CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone_number ON users(phone_number) WHERE phone_number IS NOT NULL;
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_is_active ON users(is_active) WHERE is_active = true;
CREATE INDEX idx_users_created_at ON users(created_at);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_users_updated_at();

-- Comments
COMMENT ON TABLE users IS 'Stores user account information and profiles';
COMMENT ON COLUMN users.firebase_uid IS 'Firebase Authentication UID (unique identifier)';
COMMENT ON COLUMN users.username IS 'Unique username (3-30 characters)';
COMMENT ON COLUMN users.phone_number IS 'Phone number in E.164 format (e.g., +1234567890)';
COMMENT ON COLUMN users.age IS 'User age (must be 13 or older)';
COMMENT ON COLUMN users.status IS 'Current online status';
COMMENT ON COLUMN users.is_active IS 'Soft delete flag';
