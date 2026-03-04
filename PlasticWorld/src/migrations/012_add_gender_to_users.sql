-- Migration: 012_add_gender_to_users.sql
-- Description: Add gender column to users table
-- Created: 2026-03-04

-- Create gender enum
DO $$ BEGIN
    CREATE TYPE user_gender AS ENUM ('male', 'female', 'non-binary', 'other', 'prefer_not_to_say');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add gender column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender user_gender;

-- Comment on column
COMMENT ON COLUMN users.gender IS 'User gender choice';
