-- Migration: 015_add_admin_flag.sql
-- Description: Add is_admin flag to users table
-- Created: 2026-03-06

ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;

-- Index for admin status
CREATE INDEX idx_users_is_admin ON users(is_admin) WHERE is_admin = true;

COMMENT ON COLUMN users.is_admin IS 'Flag to identify administrative users';
