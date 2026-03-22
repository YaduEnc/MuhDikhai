import { Router, Request, Response } from 'express';
import userService from '../services/user.service';
import sessionService from '../services/session.service';
import friendshipService from '../services/friendship.service';
import { authenticate } from '../middleware/auth.middleware';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/errorHandler';
import {
  validateBody,
  validateQuery,
  updateProfileSchema,
  updateStatusSchema,
  searchUsersQuerySchema,
  vibeCheckSchema,
} from '../utils/validation';
import { deleteFirebaseUser } from '../config/firebase';
import { avatarUpload } from '../middleware/multer';
import matchService from '../services/match.service';
import logger from '../utils/logger';
import { buildPublicUploadUrl } from '../utils/publicUrl';

const router = Router();

async function buildProfileUser(user: any) {
  const aura = userService.calculateAuraLevel(user.auraPoints || 0);
  const friendCount = await friendshipService.countAcceptedFriends(user.id);

  return {
    id: user.id,
    firebaseUid: user.firebaseUid,
    username: user.username,
    email: user.email,
    phoneNumber: user.phoneNumber,
    name: user.name,
    age: user.age,
    profilePictureUrl: user.profilePictureUrl,
    bio: user.bio,
    gender: user.gender,
    status: user.status,
    lastSeen: user.lastSeen,
    roomsEntered: user.roomsEntered || 0,
    friendCount,
    auraPoints: user.auraPoints,
    auraLevel: aura.name,
    auraColor: aura.color,
    nextAuraPoints: aura.nextLevel,
    auraProgress: aura.progress,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * GET /api/v1/users/me
 * Get current authenticated user's full profile
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const user = await userService.getUserById(userId);

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    const profileUser = await buildProfileUser(user);

    res.status(200).json({
      success: true,
      data: {
        user: profileUser,
      },
    });
  })
);

/**
 * GET /api/v1/users/matches/recent
 * Get recent random matches
 */
router.get(
  '/matches/recent',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const matches = await matchService.getRecentMatches(userId);

    res.status(200).json({
      success: true,
      data: { matches },
    });
  })
);

/**
 * PUT /api/v1/users/me
 * Update current user's profile
 */
router.put(
  '/me',
  authenticate,
  validateBody(updateProfileSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { username, phoneNumber, name, bio, profilePictureUrl, gender } = req.body;
    const normalizedUsername = typeof username === 'string'
      ? userService.normalizeUsername(username)
      : undefined;

    // Check if user exists
    const existingUser = await userService.getUserById(userId);
    if (!existingUser) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Check username availability if provided and different from current
    if (
      normalizedUsername !== undefined &&
      normalizedUsername !== userService.normalizeUsername(existingUser.username || '')
    ) {
      const isUsernameAvailable = await userService.isUsernameAvailable(normalizedUsername, userId);
      if (!isUsernameAvailable) {
        throw new AppError('Username is already taken', 409, 'USERNAME_TAKEN');
      }
    }

    // Check phone availability if provided and different from current
    if (phoneNumber !== undefined && phoneNumber !== existingUser.phoneNumber) {
      if (phoneNumber) {
        const isPhoneAvailable = await userService.isPhoneAvailable(phoneNumber);
        if (!isPhoneAvailable) {
          throw new AppError('Phone number is already registered', 409, 'PHONE_TAKEN');
        }
      }
    }

    // Build update data (only include provided fields)
    const updateData: {
      username?: string;
      phoneNumber?: string | null;
      name?: string;
      bio?: string | null;
      profilePictureUrl?: string | null;
      gender?: 'male' | 'female' | 'non-binary' | 'other' | 'prefer_not_to_say';
    } = {};

    if (username !== undefined) {
      updateData.username = normalizedUsername;
    }
    if (phoneNumber !== undefined) {
      updateData.phoneNumber = phoneNumber || null; // Allow empty string to clear
    }
    if (name !== undefined) {
      updateData.name = name;
    }
    if (bio !== undefined) {
      updateData.bio = bio || null; // Allow empty string to clear bio
    }
    if (profilePictureUrl !== undefined) {
      updateData.profilePictureUrl = profilePictureUrl || null; // Allow empty string to clear
    }
    if (gender !== undefined) {
      updateData.gender = gender;
    }

    // Update user
    const updatedUser = await userService.updateUser(userId, updateData);

    logger.info('User profile updated', {
      userId,
      updatedFields: Object.keys(updateData),
    });

    const profileUser = await buildProfileUser(updatedUser);

    res.status(200).json({
      success: true,
      data: {
        user: profileUser,
      },
    });
  })
);

/**
 * GET /api/v1/users/username-availability
 * Check if a username is available (case-insensitive)
 */
router.get(
  '/username-availability',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const rawUsername = typeof req.query.username === 'string' ? req.query.username : '';
    const normalizedUsername = userService.normalizeUsername(rawUsername);

    if (!normalizedUsername) {
      throw new AppError('Username is required', 400, 'USERNAME_REQUIRED');
    }

    if (normalizedUsername.length < 3 || normalizedUsername.length > 30) {
      throw new AppError('Username must be between 3 and 30 characters', 400, 'INVALID_USERNAME_LENGTH');
    }

    if (!/^[a-z0-9_]+$/.test(normalizedUsername)) {
      throw new AppError('Username can only contain lowercase letters, numbers, and underscores', 400, 'INVALID_USERNAME_FORMAT');
    }

    const available = await userService.isUsernameAvailable(normalizedUsername, req.user!.id);

    res.status(200).json({
      success: true,
      data: {
        username: normalizedUsername,
        available,
      },
    });
  })
);

/**
 * POST /api/v1/users/me/avatar
 * Upload profile picture
 */
router.post(
  '/me/avatar',
  authenticate,
  avatarUpload.single('avatar'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new AppError('No file uploaded', 400, 'NO_FILE');
    }

    // Return a stable public URL (handles reverse proxies and production hosts)
    const avatarUrl = buildPublicUploadUrl(req, req.file.filename);

    res.status(200).json({
      success: true,
      data: {
        url: avatarUrl,
      },
    });
  })
);

/**
 * GET /api/v1/users/search
 * Search users by username, email, or phone number
 * NOTE: This route must come BEFORE /:userId to avoid route conflicts
 */
router.get(
  '/search',
  authenticate,
  validateQuery(searchUsersQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    // After validation, req.query is typed correctly
    const query = req.query as unknown as {
      q: string;
      type: 'username' | 'email' | 'phone' | 'all';
      limit: number;
      offset: number;
    };

    const result = await userService.searchUsers(
      query.q,
      query.type,
      userId,
      query.limit,
      query.offset
    );

    res.status(200).json({
      success: true,
      data: {
        users: result.users.map((user) => ({
          id: user.id,
          username: user.username,
          name: user.name,
          profilePictureUrl: user.profilePictureUrl,
          bio: user.bio,
          status: user.status,
        })),
        pagination: {
          total: result.total,
          limit: query.limit,
          offset: query.offset,
          hasMore: query.offset + query.limit < result.total,
        },
      },
    });
  })
);

/**
 * GET /api/v1/users/:userId
 * Get public profile of any user by ID
 * NOTE: This route must come AFTER /search to avoid route conflicts
 */
router.get(
  '/:userId',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      throw new AppError('Invalid user ID format', 400, 'INVALID_USER_ID');
    }

    const user = await userService.getPublicUserProfile(userId);

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          age: user.age,
          profilePictureUrl: user.profilePictureUrl,
          bio: user.bio,
          gender: user.gender,
          auraPoints: user.auraPoints,
          status: user.status,
          lastSeen: user.lastSeen,
        },
      },
    });
  })
);

/**
 * PUT /api/v1/users/me/status
 * Update user's online status
 */
router.put(
  '/me/status',
  authenticate,
  validateBody(updateStatusSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { status } = req.body;

    const updatedUser = await userService.updateStatus(userId, status);

    logger.info('User status updated', {
      userId,
      status,
    });

    res.status(200).json({
      success: true,
      data: {
        status: updatedUser.status,
        lastSeen: updatedUser.lastSeen,
      },
    });
  })
);

/**
 * DELETE /api/v1/users/me
 * Soft delete user account
 */
router.delete(
  '/me',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    // Check if user exists
    const user = await userService.getUserById(userId);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Store Firebase UID before deletion
    const firebaseUid = user.firebaseUid;

    // Revoke all active sessions
    await sessionService.revokeAllSessions(userId);

    // Hard delete user account and all related data (messages, sessions, etc.) from database
    await userService.hardDeleteUser(userId);

    // Delete user from Firebase Authentication
    try {
      const deletedFromFirebase = await deleteFirebaseUser(firebaseUid);
      if (deletedFromFirebase) {
        logger.info('User hard-deleted from Firebase', {
          firebaseUid,
          userId,
        });
      } else {
        logger.info('Firebase user was already deleted or does not exist', {
          firebaseUid,
          userId,
        });
      }
    } catch (error) {
      // Log as warning because DB is already wiped, but Firebase might need manual attention
      logger.error('CRITICAL: Failed to delete user from Firebase after database wipe', {
        error: error instanceof Error ? error.message : 'Unknown error',
        firebaseUid,
        userId,
      });
    }

    logger.info('User account completely wiped from system', {
      userId,
      email: user.email,
      firebaseUid,
    });

    res.status(200).json({
      success: true,
      message: 'Account and all associated data deleted permanently',
    });
  })
);

/**
 * POST /api/v1/users/aura/vote
 * Submit a vibe check for a partner
 */
router.post(
  '/aura/vote',
  authenticate,
  validateBody(vibeCheckSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { targetId, roomId, vibe } = req.body;

    const result = await userService.submitVibeCheck(userId, targetId, roomId, vibe);

    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

export default router;
