-- Migration: 001_create_enums.sql
-- Description: Create custom enum types for the database
-- Created: 2026-01-09

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- User status enum
CREATE TYPE user_status AS ENUM ('online', 'offline', 'away');

-- Friendship status enum
CREATE TYPE friendship_status AS ENUM ('pending', 'accepted', 'denied', 'blocked');

-- Message type enum
CREATE TYPE message_type AS ENUM ('text', 'image', 'video', 'audio', 'file', 'system');

-- Message status enum
CREATE TYPE message_status AS ENUM ('sent', 'delivered', 'read');

-- Receipt type enum
CREATE TYPE receipt_type AS ENUM ('delivered', 'read', 'played');

-- Device type enum
CREATE TYPE device_type AS ENUM ('ios', 'android', 'web', 'desktop');
