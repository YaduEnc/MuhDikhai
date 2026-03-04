import { Request, Response, NextFunction } from 'express';
import jwtService from '../services/jwt.service';
import sessionService from '../services/session.service';
import userService from '../services/user.service';
import { AppError } from './errorHandler';
import logger from '../utils/logger';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        firebaseUid: string;
        email: string;
        username?: string;
        name: string;
      };
      deviceId?: string;
    }
  }
}

/**
 * Authentication middleware - verifies JWT access token
 */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Authentication required. Please provide a valid token.', 401, 'AUTH_REQUIRED');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const payload = jwtService.verifyAccessToken(token);

    // Get session from database
    const accessTokenHash = jwtService.hashToken(token);
    const session = await sessionService.getSessionByAccessToken(accessTokenHash);

    if (!session || !session.isActive) {
      throw new AppError('Session not found or inactive', 401, 'SESSION_INVALID');
    }

    // Check if session is expired
    if (new Date() > new Date(session.accessExpiresAt)) {
      throw new AppError('Access token expired', 401, 'TOKEN_EXPIRED');
    }

    // Get user
    const user = await userService.getUserById(payload.userId);

    if (!user || !user.isActive) {
      throw new AppError('User not found or inactive', 401, 'USER_INVALID');
    }

    // Update session last used
    await sessionService.updateLastUsed(session.id);

    // Attach user and device to request
    req.user = {
      id: user.id,
      firebaseUid: user.firebaseUid,
      email: user.email,
      username: user.username || undefined,
      name: user.name,
    };
    req.deviceId = payload.deviceId;

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      logger.error('Authentication middleware error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Provide more specific error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('jwt') || errorMessage.includes('token')) {
        next(new AppError(`Token validation failed: ${errorMessage}`, 401, 'AUTH_FAILED'));
      } else {
        next(new AppError(`Authentication failed: ${errorMessage}`, 401, 'AUTH_FAILED'));
      }
    }
  }
};

/**
 * Optional authentication - doesn't fail if no token provided
 */
export const optionalAuthenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Try to authenticate, but don't fail if it doesn't work
      await authenticate(req, res, () => {
        // Authentication succeeded, continue
        next();
      });
    } else {
      // No token provided, continue without user
      next();
    }
  } catch (error) {
    // If authentication fails, continue without user
    next();
  }
};
