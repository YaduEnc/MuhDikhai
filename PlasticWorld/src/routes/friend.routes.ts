import { Router, Request, Response } from 'express';
import friendshipService from '../services/friendship.service';
import userService from '../services/user.service';
import { authenticate } from '../middleware/auth.middleware';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/errorHandler';
import {
  validateBody,
  validateQuery,
  sendFriendRequestSchema,
  blockUserSchema,
  friendshipQuerySchema,
} from '../utils/validation';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /api/v1/friends
 * List all friends/friend requests with filtering
 */
router.get(
  '/',
  authenticate,
  validateQuery(friendshipQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const query = req.query as unknown as {
      status?: 'accepted' | 'pending' | 'denied' | 'blocked';
      limit: number;
      offset: number;
    };

    const result = await friendshipService.getFriendships(
      userId,
      query.status,
      query.limit,
      query.offset
    );

    // Format response to show the other user (not current user)
    const formattedFriendships = result.friendships.map((friendship) => {
      const otherUser =
        friendship.requesterId === userId ? friendship.addressee : friendship.requester;
      return {
        id: friendship.id,
        status: friendship.status,
        requestedAt: friendship.requestedAt,
        respondedAt: friendship.respondedAt,
        isRequester: friendship.requesterId === userId,
        user: otherUser,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        friendships: formattedFriendships,
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
 * POST /api/v1/friends/request
 * Send friend request to another user
 */
router.post(
  '/request',
  authenticate,
  validateBody(sendFriendRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const requesterId = req.user!.id;
    const { userId: addresseeId } = req.body;

    // Validate user exists
    const addressee = await userService.getUserById(addresseeId);
    if (!addressee) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Prevent self-friendship
    if (requesterId === addresseeId) {
      throw new AppError('Cannot send friend request to yourself', 400, 'SELF_FRIENDSHIP');
    }

    // Check if user is blocked
    const isBlocked = await friendshipService.isBlocked(requesterId, addresseeId);
    if (isBlocked) {
      throw new AppError('Cannot send request to blocked user', 403, 'USER_BLOCKED');
    }

    // Check if user is blocked by them
    const isBlockedBy = await friendshipService.isBlocked(addresseeId, requesterId);
    if (isBlockedBy) {
      throw new AppError('Cannot send request to user who blocked you', 403, 'BLOCKED_BY_USER');
    }

    try {
      const friendship = await friendshipService.sendFriendRequest(requesterId, addresseeId);

      logger.info('Friend request sent', {
        requesterId,
        addresseeId,
        friendshipId: friendship.id,
      });

      res.status(201).json({
        success: true,
        data: {
          friendship: {
            id: friendship.id,
            status: friendship.status,
            requestedAt: friendship.requestedAt,
          },
        },
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('already sent')) {
          throw new AppError('Friend request already sent', 400, 'REQUEST_ALREADY_SENT');
        }
        if (error.message.includes('already friends')) {
          throw new AppError('Users are already friends', 400, 'ALREADY_FRIENDS');
        }
      }
      throw error;
    }
  })
);

/**
 * GET /api/v1/friends/requests/pending
 * Get pending friend requests (sent and received)
 * NOTE: This route must come BEFORE /:friendshipId routes to avoid conflicts
 */
router.get(
  '/requests/pending',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const result = await friendshipService.getPendingRequests(userId);

    // Format response to show the other user
    const formatFriendship = (friendship: any) => {
      const otherUser =
        friendship.requesterId === userId ? friendship.addressee : friendship.requester;
      return {
        id: friendship.id,
        status: friendship.status,
        requestedAt: friendship.requestedAt,
        user: otherUser,
      };
    };

    res.status(200).json({
      success: true,
      data: {
        sent: result.sent.map(formatFriendship),
        received: result.received.map(formatFriendship),
      },
    });
  })
);

/**
 * POST /api/v1/friends/:friendshipId/accept
 * Accept a pending friend request
 */
router.post(
  '/:friendshipId/accept',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { friendshipId } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(friendshipId)) {
      throw new AppError('Invalid friendship ID format', 400, 'INVALID_FRIENDSHIP_ID');
    }

    try {
      const friendship = await friendshipService.acceptFriendRequest(friendshipId, userId);

      logger.info('Friend request accepted', {
        friendshipId,
        userId,
      });

      res.status(200).json({
        success: true,
        data: {
          friendship: {
            id: friendship.id,
            status: friendship.status,
            respondedAt: friendship.respondedAt,
          },
        },
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          throw new AppError('Friendship not found', 404, 'FRIENDSHIP_NOT_FOUND');
        }
        if (error.message.includes('Only the addressee')) {
          throw new AppError('Only the recipient can accept the request', 403, 'FORBIDDEN');
        }
        if (error.message.includes('not pending')) {
          throw new AppError('Friend request is not pending', 400, 'NOT_PENDING');
        }
      }
      throw error;
    }
  })
);

/**
 * POST /api/v1/friends/:friendshipId/deny
 * Deny a pending friend request
 */
router.post(
  '/:friendshipId/deny',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { friendshipId } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(friendshipId)) {
      throw new AppError('Invalid friendship ID format', 400, 'INVALID_FRIENDSHIP_ID');
    }

    try {
      const friendship = await friendshipService.denyFriendRequest(friendshipId, userId);

      logger.info('Friend request denied', {
        friendshipId,
        userId,
      });

      res.status(200).json({
        success: true,
        data: {
          friendship: {
            id: friendship.id,
            status: friendship.status,
            respondedAt: friendship.respondedAt,
          },
        },
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          throw new AppError('Friendship not found', 404, 'FRIENDSHIP_NOT_FOUND');
        }
        if (error.message.includes('Only the addressee')) {
          throw new AppError('Only the recipient can deny the request', 403, 'FORBIDDEN');
        }
        if (error.message.includes('not pending')) {
          throw new AppError('Friend request is not pending', 400, 'NOT_PENDING');
        }
      }
      throw error;
    }
  })
);

/**
 * DELETE /api/v1/friends/:friendshipId
 * Unfriend or cancel friend request
 */
router.delete(
  '/:friendshipId',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { friendshipId } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(friendshipId)) {
      throw new AppError('Invalid friendship ID format', 400, 'INVALID_FRIENDSHIP_ID');
    }

    try {
      await friendshipService.unfriend(friendshipId, userId);

      logger.info('Friendship deleted', {
        friendshipId,
        userId,
      });

      res.status(200).json({
        success: true,
        message: 'Friendship deleted successfully',
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          throw new AppError('Friendship not found', 404, 'FRIENDSHIP_NOT_FOUND');
        }
        if (error.message.includes('not part of')) {
          throw new AppError('You are not part of this friendship', 403, 'FORBIDDEN');
        }
      }
      throw error;
    }
  })
);

/**
 * POST /api/v1/friends/:userId/block
 * Block a user
 */
router.post(
  '/:userId/block',
  authenticate,
  validateBody(blockUserSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const blockerId = req.user!.id;
    const { userId: blockedId } = req.params;
    const { reason } = req.body;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(blockedId)) {
      throw new AppError('Invalid user ID format', 400, 'INVALID_USER_ID');
    }

    // Validate user exists
    const blockedUser = await userService.getUserById(blockedId);
    if (!blockedUser) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Prevent self-block
    if (blockerId === blockedId) {
      throw new AppError('Cannot block yourself', 400, 'SELF_BLOCK');
    }

    try {
      const block = await friendshipService.blockUser(blockerId, blockedId, reason);

      logger.info('User blocked', {
        blockerId,
        blockedId,
        blockId: block.id,
      });

      res.status(201).json({
        success: true,
        data: {
          block: {
            id: block.id,
            blockedId: block.blockedId,
            reason: block.reason,
            createdAt: block.createdAt,
          },
        },
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('already blocked')) {
          throw new AppError('User is already blocked', 400, 'ALREADY_BLOCKED');
        }
      }
      throw error;
    }
  })
);

/**
 * DELETE /api/v1/friends/:userId/unblock
 * Unblock a user
 */
router.delete(
  '/:userId/unblock',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const blockerId = req.user!.id;
    const { userId: blockedId } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(blockedId)) {
      throw new AppError('Invalid user ID format', 400, 'INVALID_USER_ID');
    }

    try {
      await friendshipService.unblockUser(blockerId, blockedId);

      logger.info('User unblocked', {
        blockerId,
        blockedId,
      });

      res.status(200).json({
        success: true,
        message: 'User unblocked successfully',
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          throw new AppError('Block not found', 404, 'BLOCK_NOT_FOUND');
        }
      }
      throw error;
    }
  })
);

export default router;
