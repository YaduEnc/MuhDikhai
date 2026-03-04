import { Router, Request, Response } from 'express';
import { verifyIdToken } from '../config/firebase';
import jwtService from '../services/jwt.service';
import sessionService from '../services/session.service';
import userService from '../services/user.service';
import deviceService from '../services/device.service';
import { authenticate } from '../middleware/auth.middleware';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/errorHandler';
import {
  validateBody,
  googleSignInSchema,
  completeProfileSchema,
  refreshTokenSchema,
} from '../utils/validation';
import logger from '../utils/logger';

// Note: database is imported dynamically in refresh route to avoid circular dependency

const router = Router();

/**
 * POST /api/v1/auth/google-signin
 * Google OAuth sign-in
 */
router.post(
  '/google-signin',
  validateBody(googleSignInSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { idToken } = req.body;

    // Verify Firebase ID token
    const decodedToken = await verifyIdToken(idToken);
    const firebaseUid = decodedToken.uid;
    const email = decodedToken.email;
    const name = decodedToken.name || 'User';
    const picture = decodedToken.picture;

    // Optimized: Check user by Firebase UID OR email in single query
    let user = await userService.getUserByFirebaseUidOrEmail(firebaseUid, email, true);

    // If user exists but is inactive, reactivate them
    if (user && !user.isActive) {
      user = await userService.reactivateUser(user.id);
      logger.info('User reactivated on sign-in', {
        userId: user.id,
        firebaseUid: user.firebaseUid,
      });
    }

    // Create user if doesn't exist
    if (!user) {
      try {
        user = await userService.createUser({
          firebaseUid,
          email: email || '',
          name,
          profilePictureUrl: picture,
        });
      } catch (error) {
        // If creation fails due to duplicate email, try to find and reactivate
        if (error instanceof Error && error.message.includes('duplicate key') && email) {
          const existingUser = await userService.getUserByEmail(email, true);
          if (existingUser) {
            // Update Firebase UID if it changed and reactivate
            const database = (await import('../config/database')).default;
            if (existingUser.firebaseUid !== firebaseUid) {
              // Update firebase_uid directly
              await database.query(
                'UPDATE users SET firebase_uid = $1, is_active = true WHERE id = $2',
                [firebaseUid, existingUser.id]
              );
            } else {
              await userService.reactivateUser(existingUser.id);
            }
            user = await userService.getUserById(existingUser.id);
            if (!user) {
              throw new AppError('Failed to retrieve reactivated user', 500, 'INTERNAL_ERROR');
            }
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
    }

    // Ensure user is not null at this point
    if (!user) {
      throw new AppError('Failed to get or create user', 500, 'USER_CREATION_FAILED');
    }

    // Get or create device
    const deviceInfo = req.body.deviceInfo || {
      deviceName: req.get('user-agent')?.substring(0, 100) || 'Unknown Device',
      deviceType: (req.get('user-agent')?.includes('Mobile') ? 'android' : 'web') as 'ios' | 'android' | 'web' | 'desktop',
    };

    const device = await deviceService.createOrGetDevice({
      userId: user.id,
      deviceName: deviceInfo.deviceName || 'Unknown Device',
      deviceType: deviceInfo.deviceType || 'web',
      deviceToken: deviceInfo.deviceToken,
      userAgent: req.get('user-agent') || undefined,
      ipAddress: req.ip || undefined,
    });

    // Generate JWT tokens
    const tokenPair = jwtService.generateTokenPair(user.id, device.id);

    // Optimized: Create session and update last seen in parallel
    await Promise.all([
      sessionService.createSession(
        user.id,
        device.id,
        tokenPair.accessToken,
        tokenPair.refreshToken,
        req.ip || undefined,
        req.get('user-agent') || undefined
      ),
      userService.updateLastSeen(user.id)
    ]);

    logger.info('User signed in successfully', {
      userId: user.id,
      firebaseUid,
      deviceId: device.id,
    });

    res.status(200).json({
      success: true,
      data: {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        accessExpiresAt: tokenPair.accessExpiresAt,
        refreshExpiresAt: tokenPair.refreshExpiresAt,
        user: {
          id: user.id,
          firebaseUid: user.firebaseUid,
          email: user.email,
          username: user.username,
          name: user.name,
          profilePictureUrl: user.profilePictureUrl,
          bio: user.bio,
          status: user.status,
          isProfileComplete: !!user.username && !!user.age,
        },
        device: {
          id: device.id,
          deviceName: device.deviceName,
          deviceType: device.deviceType,
        },
      },
    });
  })
);

/**
 * POST /api/v1/auth/complete-profile
 * Complete user profile after first login
 */
router.post(
  '/complete-profile',
  authenticate,
  validateBody(completeProfileSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { username, phoneNumber, age } = req.body;
    const userId = req.user!.id;

    // Check username availability
    const isUsernameAvailable = await userService.isUsernameAvailable(username);
    if (!isUsernameAvailable) {
      throw new AppError('Username is already taken', 409, 'USERNAME_TAKEN');
    }

    // Check phone availability if provided
    if (phoneNumber) {
      const isPhoneAvailable = await userService.isPhoneAvailable(phoneNumber);
      if (!isPhoneAvailable) {
        throw new AppError('Phone number is already registered', 409, 'PHONE_TAKEN');
      }
    }

    // Update user profile
    const updatedUser = await userService.updateUser(userId, {
      username,
      phoneNumber,
      age,
    });

    logger.info('User profile completed', {
      userId,
      username,
    });

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: updatedUser.id,
          firebaseUid: updatedUser.firebaseUid,
          email: updatedUser.email,
          username: updatedUser.username,
          phoneNumber: updatedUser.phoneNumber,
          name: updatedUser.name,
          age: updatedUser.age,
          profilePictureUrl: updatedUser.profilePictureUrl,
          bio: updatedUser.bio,
          status: updatedUser.status,
        },
      },
    });
  })
);

/**
 * POST /api/v1/auth/refresh
 * Refresh access token using refresh token
 */
router.post(
  '/refresh',
  validateBody(refreshTokenSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    // Verify refresh token
    const payload = jwtService.verifyRefreshToken(refreshToken);

    // Get session from database
    const refreshTokenHash = jwtService.hashToken(refreshToken);
    const session = await sessionService.getSessionByRefreshToken(refreshTokenHash);

    if (!session || !session.isActive) {
      throw new AppError('Session not found or inactive', 401, 'SESSION_INVALID');
    }

    // Check if refresh token is expired
    if (new Date() > new Date(session.refreshExpiresAt)) {
      throw new AppError('Refresh token expired', 401, 'TOKEN_EXPIRED');
    }

    // Verify user still exists and is active
    const user = await userService.getUserById(payload.userId);
    if (!user || !user.isActive) {
      throw new AppError('User not found or inactive', 401, 'USER_INVALID');
    }

    // Generate new token pair
    const tokenPair = jwtService.generateTokenPair(user.id, payload.deviceId);

    // Update session with new tokens
    const newAccessTokenHash = jwtService.hashToken(tokenPair.accessToken);
    const newRefreshTokenHash = jwtService.hashToken(tokenPair.refreshToken);

    // Import database here to avoid circular dependency
    const database = (await import('../config/database')).default;
    await database.query(
      `UPDATE sessions 
      SET access_token_hash = $1, refresh_token_hash = $2,
          access_expires_at = $3, refresh_expires_at = $4,
          last_used_at = CURRENT_TIMESTAMP
      WHERE id = $5`,
      [
        newAccessTokenHash,
        newRefreshTokenHash,
        tokenPair.accessExpiresAt,
        tokenPair.refreshExpiresAt,
        session.id,
      ]
    );

    logger.info('Token refreshed successfully', {
      userId: user.id,
      deviceId: payload.deviceId,
    });

    res.status(200).json({
      success: true,
      data: {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        accessExpiresAt: tokenPair.accessExpiresAt,
        refreshExpiresAt: tokenPair.refreshExpiresAt,
      },
    });
  })
);

/**
 * POST /api/v1/auth/logout
 * Logout user (revoke current session)
 */
router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const deviceId = req.deviceId!;

    // Get session to revoke
    const sessions = await sessionService.getUserSessions(userId);
    const session = sessions.find((s) => s.deviceId === deviceId);

    if (session) {
      await sessionService.revokeSession(session.id, userId);
    }

    logger.info('User logged out', {
      userId,
      deviceId,
    });

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  })
);

/**
 * GET /api/v1/auth/sessions
 * Get all active sessions for the user
 */
router.get(
  '/sessions',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const sessions = await sessionService.getUserSessions(userId);

    res.status(200).json({
      success: true,
      data: {
        sessions: sessions.map((session) => ({
          id: session.id,
          deviceId: session.deviceId,
          deviceName: (session as any).deviceName,
          deviceType: (session as any).deviceType,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          createdAt: session.createdAt,
          lastUsedAt: session.lastUsedAt,
          isCurrent: session.deviceId === req.deviceId,
        })),
      },
    });
  })
);

/**
 * DELETE /api/v1/auth/sessions/:deviceId
 * Revoke a specific session
 */
router.delete(
  '/sessions/:deviceId',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { deviceId } = req.params;

    // Get all sessions to find the one to revoke
    const sessions = await sessionService.getUserSessions(userId);
    const session = sessions.find((s) => s.deviceId === deviceId);

    if (!session) {
      throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
    }

    await sessionService.revokeSession(session.id, userId);

    logger.info('Session revoked', {
      userId,
      deviceId,
      sessionId: session.id,
    });

    res.status(200).json({
      success: true,
      message: 'Session revoked successfully',
    });
  })
);

export default router;
