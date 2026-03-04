-- Initialize database with extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create database if it doesn't exist (this runs inside the container)
-- The database is created by POSTGRES_DB environment variable
-- This file is for any additional setup
