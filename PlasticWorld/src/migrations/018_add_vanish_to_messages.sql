-- Add is_vanish column to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_vanish BOOLEAN DEFAULT false;
