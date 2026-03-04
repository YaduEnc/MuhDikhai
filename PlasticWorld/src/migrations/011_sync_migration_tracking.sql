-- Create schema_migrations table if it doesn't exist
CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  migration_number INTEGER NOT NULL UNIQUE,
  filename VARCHAR(255) NOT NULL,
  run_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Record all migrations that were already applied via Docker init scripts
-- Using a timestamp from when the database was initialized
INSERT INTO schema_migrations (migration_number, filename, run_at)
VALUES
  (1, '001_create_enums.sql', CURRENT_TIMESTAMP),
  (2, '002_create_users.sql', CURRENT_TIMESTAMP),
  (3, '003_create_devices.sql', CURRENT_TIMESTAMP),
  (4, '004_create_sessions.sql', CURRENT_TIMESTAMP),
  (5, '005_create_friendships.sql', CURRENT_TIMESTAMP),
  (6, '006_create_blocks.sql', CURRENT_TIMESTAMP),
  (7, '007_create_messages.sql', CURRENT_TIMESTAMP),
  (8, '008_create_message_receipts.sql', CURRENT_TIMESTAMP),
  (9, '009_create_message_media.sql', CURRENT_TIMESTAMP),
  (10, '010_create_encryption_keys.sql', CURRENT_TIMESTAMP)
ON CONFLICT (migration_number) DO NOTHING;
