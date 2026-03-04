import { Router, Request, Response } from 'express';
import userService from '../services/user.service';
import sessionService from '../services/session.service';
import { authenticate } from '../middleware/auth.middleware';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/errorHandler';
import {
  validateBody,
  validateQuery,
  updateProfileSchema,
  updateStatusSchema,
  searchUsersQuerySchema,
} from '../utils/validation';
import { deleteFirebaseUser } from '../config/firebase';
import { upload } from '../middleware/multer';
import logger from '../utils/logger';

const router = Router();

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

    res.status(200).json({
      success: true,
      data: {
        user: {
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
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
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

    // Check if user exists
    const existingUser = await userService.getUserById(userId);
    if (!existingUser) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Check username availability if provided and different from current
    if (username !== undefined && username !== existingUser.username) {
      const isUsernameAvailable = await userService.isUsernameAvailable(username);
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
      bio?: string;
      profilePictureUrl?: string | null;
      gender?: 'male' | 'female' | 'non-binary' | 'other' | 'prefer_not_to_say';
    } = {};

    if (username !== undefined) {
      updateData.username = username;
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

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: updatedUser.id,
          firebaseUid: updatedUser.firebaseUid,
          username: updatedUser.username,
          email: updatedUser.email,
          phoneNumber: updatedUser.phoneNumber,
          name: updatedUser.name,
          age: updatedUser.age,
          profilePictureUrl: updatedUser.profilePictureUrl,
          bio: updatedUser.bio,
          gender: updatedUser.gender,
          status: updatedUser.status,
          lastSeen: updatedUser.lastSeen,
          createdAt: updatedUser.createdAt,
          updatedAt: updatedUser.updatedAt,
        },
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
  upload.single('avatar'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new AppError('No file uploaded', 400, 'NO_FILE');
    }

    // Return the URL to the uploaded file
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const avatarUrl = `${baseUrl}/uploads/${req.file.filename}`;

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
          profilePictureUrl: user.profilePictureUrl,
          bio: user.bio,
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

    // Soft delete user account in database
    await userService.deleteUser(userId);

    // Delete user from Firebase Authentication
    try {
      const deleted = await deleteFirebaseUser(firebaseUid);
      if (deleted) {
        logger.info('User deleted from Firebase', {
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
      // Only log as error if it's an unexpected error (not user-not-found)
      // User is already soft deleted in DB, so we continue anyway
      logger.warn('Unexpected error deleting Firebase user (user already soft deleted in DB)', {
        error: error instanceof Error ? error.message : 'Unknown error',
        firebaseUid,
        userId,
      });
      // Continue - user is already soft deleted in our database
    }

    logger.info('User account deleted', {
      userId,
      email: user.email,
      firebaseUid,
    });

    res.status(200).json({
      success: true,
      message: 'Account deleted successfully',
    });
  })
);

export default router;
