import Redis, { RedisOptions } from 'ioredis';
import logger from '../utils/logger';

class RedisClient {
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  private publisher: Redis | null = null;

  /**
   * Initialize Redis connection
   */
  public async connect(): Promise<void> {
    try {
      const options: RedisOptions = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB || '0', 10),
        keyPrefix: process.env.REDIS_KEY_PREFIX || 'plasticworld:',
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
      };

      // Main client for general operations
      this.client = new Redis(options);

      // Subscriber client for pub/sub
      this.subscriber = new Redis(options);

      // Publisher client for pub/sub
      this.publisher = new Redis(options);

      // Event handlers for main client
      this.client.on('connect', () => {
        logger.info('Redis client connecting...');
      });

      this.client.on('ready', () => {
        logger.info('Redis client ready', {
          host: options.host,
          port: options.port,
          db: options.db,
        });
      });

      this.client.on('error', (error: Error) => {
        logger.error('Redis client error', { error: error.message });
      });

      this.client.on('close', () => {
        logger.warn('Redis client connection closed');
      });

      this.client.on('reconnecting', () => {
        logger.info('Redis client reconnecting...');
      });

      // Wait for connection
      await this.client.ping();

      logger.info('Redis connected successfully', {
        host: options.host,
        port: options.port,
        db: options.db,
      });
    } catch (error) {
      logger.error('Failed to connect to Redis', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Get the main Redis client
   */
  public getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis client not initialized. Call connect() first.');
    }
    return this.client;
  }

  /**
   * Get the subscriber client
   */
  public getSubscriber(): Redis {
    if (!this.subscriber) {
      throw new Error('Redis subscriber not initialized. Call connect() first.');
    }
    return this.subscriber;
  }

  /**
   * Get the publisher client
   */
  public getPublisher(): Redis {
    if (!this.publisher) {
      throw new Error('Redis publisher not initialized. Call connect() first.');
    }
    return this.publisher;
  }

  /**
   * Set a key-value pair with optional TTL
   */
  public async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  /**
   * Get a value by key
   */
  public async get(key: string): Promise<string | null> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return await this.client.get(key);
  }

  /**
   * Delete a key
   */
  public async del(key: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return await this.client.del(key);
  }

  /**
   * Check if a key exists
   */
  public async exists(key: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    const result = await this.client.exists(key);
    return result === 1;
  }

  /**
   * Set expiration on a key
   */
  public async expire(key: string, seconds: number): Promise<boolean> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    const result = await this.client.expire(key, seconds);
    return result === 1;
  }

  /**
   * Get TTL of a key
   */
  public async ttl(key: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return await this.client.ttl(key);
  }

  /**
   * Increment a key
   */
  public async incr(key: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return await this.client.incr(key);
  }

  /**
   * Decrement a key
   */
  public async decr(key: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return await this.client.decr(key);
  }

  /**
   * Set hash field
   */
  public async hset(key: string, field: string, value: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return await this.client.hset(key, field, value);
  }

  /**
   * Get hash field
   */
  public async hget(key: string, field: string): Promise<string | null> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return await this.client.hget(key, field);
  }

  /**
   * Get all hash fields
   */
  public async hgetall(key: string): Promise<Record<string, string>> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return await this.client.hgetall(key);
  }

  /**
   * Delete hash field
   */
  public async hdel(key: string, field: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return await this.client.hdel(key, field);
  }

  /**
   * Publish a message to a channel
   */
  public async publish(channel: string, message: string): Promise<number> {
    if (!this.publisher) {
      throw new Error('Redis publisher not initialized');
    }
    return await this.publisher.publish(channel, message);
  }

  /**
   * Subscribe to a channel
   */
  public async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    if (!this.subscriber) {
      throw new Error('Redis subscriber not initialized');
    }
      await this.subscriber.subscribe(channel);
      this.subscriber.on('message', (ch: string, msg: string) => {
        if (ch === channel) {
          callback(msg);
        }
      });
  }

  /**
   * Check Redis health
   */
  public async healthCheck(): Promise<{ status: string; latency?: number }> {
    try {
      const start = Date.now();
      await this.client?.ping();
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
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
    if (this.publisher) {
      await this.publisher.quit();
      this.publisher = null;
    }
    logger.info('Redis connections closed');
  }
}

// Export singleton instance
const redisClient = new RedisClient();
export default redisClient;
