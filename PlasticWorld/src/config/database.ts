import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import logger from '../utils/logger';

class Database {
  private pool: Pool | null = null;

  /**
   * Initialize PostgreSQL connection pool
   */
  public async connect(): Promise<void> {
    try {
      const config: PoolConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'plasticworld_db',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
        min: parseInt(process.env.DB_POOL_MIN || '2', 10),
        max: parseInt(process.env.DB_POOL_MAX || '10', 10),
        idleTimeoutMillis: parseInt(process.env.DB_TIMEOUT || '30000', 10),
        connectionTimeoutMillis: 10000, // Increased to 10 seconds
      };

      logger.info('Attempting PostgreSQL connection', {
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
      });

      this.pool = new Pool(config);

      // Test connection with manual timeout
      logger.info('Testing PostgreSQL connection...');
      try {
        const connectPromise = this.pool.connect();
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error('PostgreSQL connection timeout after 15 seconds'));
          }, 15000);
        });
        
        const client = await Promise.race([connectPromise, timeoutPromise]);
        logger.info('Connection acquired, testing query...');
        const result = await client.query('SELECT NOW()');
        client.release();
        logger.info('Connection test successful');

        logger.info('PostgreSQL connected successfully', {
          host: config.host,
          port: config.port,
          database: config.database,
          timestamp: result.rows[0].now,
        });
      } catch (error) {
        logger.error('PostgreSQL connection failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          host: config.host,
          port: config.port,
          database: config.database,
          user: config.user,
        });
        throw error;
      }

      // Handle pool errors
      this.pool.on('error', (err: Error) => {
        logger.error('Unexpected PostgreSQL pool error', { error: err.message, stack: err.stack });
      });
    } catch (error) {
      logger.error('Failed to connect to PostgreSQL', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Execute a query
   */
  public async query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error('Database pool not initialized. Call connect() first.');
    }

    const start = Date.now();
    try {
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;

      // Log slow queries (>100ms)
      if (duration > 100) {
        logger.warn('Slow query detected', {
          query: text.substring(0, 100),
          duration: `${duration}ms`,
          rows: result.rowCount,
        });
      }

      return result;
    } catch (error) {
      logger.error('Database query error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        query: text.substring(0, 100),
        params: params ? JSON.stringify(params) : undefined,
      });
      throw error;
    }
  }

  /**
   * Get a client from the pool for transactions
   */
  public async getClient() {
    if (!this.pool) {
      throw new Error('Database pool not initialized. Call connect() first.');
    }
    return await this.pool.connect();
  }

  /**
   * Execute a transaction
   */
  public async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check database health
   */
  public async healthCheck(): Promise<{ status: string; latency?: number }> {
    try {
      const start = Date.now();
      await this.query('SELECT 1');
      const latency = Date.now() - start;

      return {
        status: 'connected',
        latency,
      };
    } catch (error) {
      return {
        status: 'disconnected',
      };
    }
  }

  /**
   * Close all connections
   */
  public async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      logger.info('PostgreSQL connection pool closed');
      this.pool = null;
    }
  }
}

// Export singleton instance
const database = new Database();
export default database;
