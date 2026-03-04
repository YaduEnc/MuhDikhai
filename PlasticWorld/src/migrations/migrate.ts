import fs from 'fs';
import path from 'path';
import database from '../config/database';
import logger from '../utils/logger';

interface Migration {
  filename: string;
  number: number;
  sql: string;
}

/**
 * Get all migration files in order
 */
function getMigrations(): Migration[] {
  const migrationsDir = path.join(__dirname);
  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql') && file.startsWith('0'))
    .sort();

  return files.map(file => {
    const number = parseInt(file.split('_')[0], 10);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    return {
      filename: file,
      number,
      sql,
    };
  });
}

/**
 * Check if migration has been run
 */
async function isMigrationRun(migrationNumber: number): Promise<boolean> {
  try {
    const result = await database.query(
      'SELECT 1 FROM schema_migrations WHERE migration_number = $1',
      [migrationNumber]
    );
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    // Table doesn't exist yet, so no migrations have run
    return false;
  }
}


/**
 * Create schema_migrations table if it doesn't exist
 */
async function ensureMigrationsTable(): Promise<void> {
  try {
    await database.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_number INTEGER NOT NULL UNIQUE,
        filename VARCHAR(255) NOT NULL,
        run_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    logger.info('Schema migrations table ready');
  } catch (error) {
    logger.error('Failed to create schema_migrations table', { error });
    throw error;
  }
}

/**
 * Run all pending migrations
 */
async function runMigrations(): Promise<void> {
  try {
    logger.info('Starting database migrations...');

    // Ensure migrations table exists
    await ensureMigrationsTable();

    // Get all migrations
    const migrations = getMigrations();
    logger.info(`Found ${migrations.length} migration files`);

    // Run each migration
    for (const migration of migrations) {
      const isRun = await isMigrationRun(migration.number);

      if (isRun) {
        logger.info(`Skipping migration ${migration.filename} (already run)`);
        continue;
      }

      logger.info(`Running migration ${migration.filename}...`);

      try {
        // Run migration in a transaction
        await database.transaction(async (client) => {
          // Execute the entire SQL file as one statement
          // This handles multi-statement SQL with functions, triggers, etc.
          await client.query(migration.sql);

          // Mark migration as run
          await client.query(
            'INSERT INTO schema_migrations (migration_number, filename, run_at) VALUES ($1, $2, $3)',
            [migration.number, migration.filename, new Date()]
          );
        });

        logger.info(`✅ Migration ${migration.filename} completed successfully`);
      } catch (error) {
        logger.error(`❌ Migration ${migration.filename} failed`, { error });
        throw error;
      }
    }

    logger.info('✅ All migrations completed successfully');
  } catch (error) {
    logger.error('Migration process failed', { error });
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    // Connect to database
    await database.connect();

    // Run migrations
    await runMigrations();

    // Close connection
    await database.disconnect();

    process.exit(0);
  } catch (error) {
    logger.error('Migration script failed', { error });
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { runMigrations };
