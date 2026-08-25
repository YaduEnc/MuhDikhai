import dotenv from 'dotenv';

// Load environment variables first
dotenv.config();

import { Server as HTTPServer } from 'http';
import app from './app';
import database from './config/database';
import redisClient from './config/redis';
import logger from './utils/logger';
import { initializeFirebase } from './config/firebase';
import { initializeSocket } from './config/socket';

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Graceful shutdown handler
 */
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  // Close server
  server.close(() => {
    logger.info('HTTP server closed');

    // Close database connections
    database
      .disconnect()
      .then(() => {
        logger.info('Database connections closed');
      })
      .catch((error) => {
        logger.error('Error closing database connections', { error });
      });

    // Close Redis connections
    redisClient
      .disconnect()
      .then(() => {
        logger.info('Redis connections closed');
        process.exit(0);
      })
      .catch((error) => {
        logger.error('Error closing Redis connections', { error });
        process.exit(1);
      });
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

/**
 * Retry a startup dependency with backoff.
 *
 * Managed private networks (Railway's *.railway.internal, and friends) are not
 * reliably resolvable the instant a container boots, so a first-attempt DNS
 * failure is expected rather than fatal. A transient database blip should not
 * permanently kill the service either.
 */
const connectWithRetry = async (
  label: string,
  connect: () => Promise<void>,
  attempts = 10,
  baseDelayMs = 1000
): Promise<void> => {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await connect();
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (attempt === attempts) {
        console.error(`❌ ${label} failed after ${attempts} attempts: ${message}`);
        throw error;
      }

      const delay = Math.min(baseDelayMs * attempt, 8000);
      console.warn(
        `⚠️  ${label} attempt ${attempt}/${attempts} failed (${message}); retrying in ${delay}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

/**
 * Initialize server
 */
const startServer = async () => {
  try {
    console.log('🚀 Starting server initialization...');
    
    // Initialize Firebase first (after dotenv has loaded)
    console.log('📦 Initializing Firebase Admin SDK...');
    logger.info('Initializing Firebase Admin SDK...');
    initializeFirebase();
    console.log('✅ Firebase initialized');

    // Connect to database
    console.log('🗄️  Connecting to PostgreSQL...');
    logger.info('Connecting to PostgreSQL...');
    await connectWithRetry('PostgreSQL connection', () => database.connect());
    console.log('✅ PostgreSQL connected');

    // Connect to Redis
    console.log('💾 Connecting to Redis...');
    logger.info('Connecting to Redis...');
    await connectWithRetry('Redis connection', () => redisClient.connect());
    console.log('✅ Redis connected');

    // Start HTTP server
    console.log(`🌐 Starting HTTP server on port ${PORT}...`);
    const httpServer: HTTPServer = app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      logger.info(`🚀 Server running on port ${PORT}`, {
        environment: NODE_ENV,
        port: PORT,
        timestamp: new Date().toISOString(),
      });
    });

    // Initialize Socket.io
    console.log('🔌 Initializing Socket.io server...');
    initializeSocket(httpServer);
    console.log('✅ Socket.io server initialized');

    // Handle server errors
    httpServer.on('error', (error: NodeJS.ErrnoException) => {
      if (error.syscall !== 'listen') {
        throw error;
      }

      const bind = typeof PORT === 'string' ? `Pipe ${PORT}` : `Port ${PORT}`;

      switch (error.code) {
        case 'EACCES':
          logger.error(`${bind} requires elevated privileges`);
          process.exit(1);
          break;
        case 'EADDRINUSE':
          logger.error(`${bind} is already in use`);
          process.exit(1);
          break;
        default:
          throw error;
      }
    });

    // Graceful shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack,
      });
      gracefulShutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any, _promise: Promise<any>) => {
      logger.error('Unhandled Rejection', {
        reason: reason?.message || reason,
        stack: reason?.stack,
      });
      gracefulShutdown('unhandledRejection');
    });

    return httpServer;
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Writes to stdout/stderr are asynchronous when piped, which is how a
    // container gets collected. Exiting immediately truncates them and the
    // platform reports a crash with no logs at all — give them time to flush.
    await new Promise((resolve) => setTimeout(resolve, 500));
    process.exit(1);
  }
};

// Start the server
let server: any;
startServer().then((s) => {
  server = s;
});

export default server;
