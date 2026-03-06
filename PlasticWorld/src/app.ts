import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import 'express-async-errors';
import logger from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const app: Application = express();

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware - Configure Helmet to allow Firebase popups
app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'unsafe-none' }, // Allow Firebase popup windows
  crossOriginEmbedderPolicy: false, // Allow embedding
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow images from this origin
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "img-src": ["'self'", "data:", "*.yaduraj.me"],
      "connect-src": ["'self'", "*.yaduraj.me", "https://*.yaduraj.me", "wss://*.yaduraj.me"],
    },
  },
}));

// CORS configuration
const getCorsOrigins = () => {
  const defaultOrigins = [
    'http://localhost:3000',
    'http://localhost:8080',
    'http://localhost:8081',
    'http://localhost:8082',
    'http://localhost:8083', // For messaging test page
    'http://localhost:5173', // Vite dev server
    'https://yaduraj.me',
    'https://muhdikhai.yaduraj.me',
    'https://batchit.yaduraj.me',
  ];

  // In production, merge CORS_ORIGIN with default localhost origins
  // This allows local frontend development while connecting to production backend
  if (process.env.CORS_ORIGIN) {
    const productionOrigins = process.env.CORS_ORIGIN.split(',').map((origin: string) => origin.trim());
    // Merge and deduplicate
    return [...new Set([...defaultOrigins, ...productionOrigins])];
  }

  return defaultOrigins;
};

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = getCorsOrigins();

    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked origin', { origin, allowedOrigins });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
};
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
// Serve uploaded files with cross-origin resource policy so
// batchit.yaduraj.me can load images hosted on muhdikhai.yaduraj.me
app.use('/uploads', (_req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
}, express.static(path.join(__dirname, '../public/uploads')));

// Compression middleware
app.use(compression());

// HTTP request logging
if (process.env.NODE_ENV !== 'test') {
  app.use(
    morgan('combined', {
      stream: logger.stream as any,
      skip: (req: Request) => req.path === '/health',
    })
  );
}

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10), // 100 requests per window
  message: {
    success: false,
    error: {
      message: 'Too many requests from this IP, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', limiter);

// Health check endpoint (before rate limiting)
app.get('/health', async (_req: Request, res: Response) => {
  try {
    // Import here to avoid circular dependencies
    const database = (await import('./config/database')).default;
    const redisClient = (await import('./config/redis')).default;

    const [dbHealth, redisHealth] = await Promise.all([
      database.healthCheck(),
      redisClient.healthCheck(),
    ]);

    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: dbHealth,
        redis: redisHealth,
      },
    };

    const isHealthy = dbHealth.status === 'connected' && redisHealth.status === 'connected';

    res.status(isHealthy ? 200 : 503).json(health);
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

// API routes
const apiVersion = process.env.API_VERSION || 'v1';

// Import routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import friendRoutes from './routes/friend.routes';
import messageRoutes from './routes/message.routes';
import encryptionRoutes from './routes/encryption.routes';
import reportRoutes from './routes/report.routes';
import adminRoutes from './routes/admin.routes';

// Mount routes
app.use(`/api/${apiVersion}/auth`, authRoutes);
app.use(`/api/${apiVersion}/users`, userRoutes);
app.use(`/api/${apiVersion}/friends`, friendRoutes);
app.use(`/api/${apiVersion}/messages`, messageRoutes);
app.use(`/api/${apiVersion}/encryption`, encryptionRoutes);
app.use(`/api/${apiVersion}/reports`, reportRoutes);
app.use(`/api/${apiVersion}/admin`, adminRoutes);

// API root endpoint
app.get(`/api/${apiVersion}`, (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'PlasticWorld API',
    version: apiVersion,
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: `/api/${apiVersion}/auth`,
      users: `/api/${apiVersion}/users`,
      friends: `/api/${apiVersion}/friends`,
      messages: `/api/${apiVersion}/messages`,
      encryption: `/api/${apiVersion}/encryption`,
      reports: `/api/${apiVersion}/reports`,
      admin: `/api/${apiVersion}/admin`,
    },
  });
});

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

export default app;
