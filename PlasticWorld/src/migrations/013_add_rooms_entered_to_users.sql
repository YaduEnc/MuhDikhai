-- Migration: 013_add_rooms_entered_to_users.sql
-- Description: Add rooms_entered column to users table
-- Created: 2026-03-04

-- Add rooms_entered column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS rooms_entered INTEGER DEFAULT 0;

-- Comment on column
COMMENT ON COLUMN users.rooms_entered IS 'Total number of random rooms entered by the user';
