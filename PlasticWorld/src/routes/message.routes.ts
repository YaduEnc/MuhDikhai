import { Router, Request, Response } from 'express';
import messageService from '../services/message.service';
import { authenticate } from '../middleware/auth.middleware';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/errorHandler';
import {
  validateBody,
  validateQuery,
  sendMessageSchema,
  editMessageSchema,
  conversationQuerySchema,
} from '../utils/validation';
import { z } from 'zod';
import logger from '../utils/logger';

const router = Router();

/**
 * POST /api/v1/messages
 * Send a message
 */
router.post(
  '/',
  authenticate,
  validateBody(sendMessageSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const senderId = req.user!.id;
    const { recipientId, encryptedContent, encryptedKey, messageType, mediaUrl, mediaSizeBytes, replyToMessageId } = req.body;

    // Convert base64 to Buffer
    const encryptedContentBuffer = Buffer.from(encryptedContent, 'base64');
    const encryptedKeyBuffer = Buffer.from(encryptedKey, 'base64');

    const message = await messageService.sendMessage(senderId, {
      recipientId,
      encryptedContent: encryptedContentBuffer,
      encryptedKey: encryptedKeyBuffer,
      messageType,
      mediaUrl,
      mediaSizeBytes,
      replyToMessageId,
    });

    logger.info('Message sent via REST API', {
      messageId: message.id,
      senderId,
      recipientId,
    });

    res.status(201).json({
      success: true,
      data: {
        message: {
          id: message.id,
          senderId: message.senderId,
          recipientId: message.recipientId,
          messageType: message.messageType,
          status: message.status,
          sentAt: message.sentAt,
          replyToMessageId: message.replyToMessageId,
        },
      },
    });
  })
);

/**
 * GET /api/v1/messages/conversations
 * Get all conversations for the current user
 */
router.get(
  '/conversations',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const conversations = await messageService.getConversations(userId);

    res.status(200).json({
      success: true,
      data: {
        conversations,
      },
    });
  })
);

/**
 * GET /api/v1/messages/:userId
 * Get conversation between current user and another user
 */
router.get(
  '/:userId',
  authenticate,
  validateQuery(conversationQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { userId: otherUserId } = req.params;
    const query = req.query as unknown as {
      limit: number;
      offset: number;
      beforeMessageId?: string;
    };

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(otherUserId)) {
      throw new AppError('Invalid user ID format', 400, 'INVALID_USER_ID');
    }

    const result = await messageService.getConversation(
      userId,
      otherUserId,
      query.limit,
      query.offset,
      query.beforeMessageId
    );

    res.status(200).json({
      success: true,
      data: {
        messages: result.messages.map((msg) => {
          // encryptedContent and encryptedKey are already base64 strings from the service layer
          return {
            id: msg.id,
            senderId: msg.senderId,
            recipientId: msg.recipientId,
            encryptedContent: msg.encryptedContent,
            encryptedKey: msg.encryptedKey,
            messageType: msg.messageType,
            mediaUrl: msg.mediaUrl,
            mediaSizeBytes: msg.mediaSizeBytes,
            status: msg.status,
            sentAt: msg.sentAt,
            deliveredAt: msg.deliveredAt,
            readAt: msg.readAt,
            replyToMessageId: msg.replyToMessageId,
            isEdited: msg.isEdited,
            editedAt: msg.editedAt,
            sender: msg.sender,
            recipient: msg.recipient,
          };
        }),
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
 * PUT /api/v1/messages/:messageId
 * Edit a message
 */
router.put(
  '/:messageId',
  authenticate,
  validateBody(editMessageSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { messageId } = req.params;
    const { encryptedContent, encryptedKey } = req.body;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(messageId)) {
      throw new AppError('Invalid message ID format', 400, 'INVALID_MESSAGE_ID');
    }

    // Convert base64 to Buffer if provided
    const updateData: {
      encryptedContent?: Buffer;
      encryptedKey?: Buffer;
    } = {};

    if (encryptedContent) {
      updateData.encryptedContent = Buffer.from(encryptedContent, 'base64');
    }
    if (encryptedKey) {
      updateData.encryptedKey = Buffer.from(encryptedKey, 'base64');
    }

    const message = await messageService.editMessage(messageId, userId, updateData);

    logger.info('Message edited via REST API', {
      messageId,
      userId,
    });

    res.status(200).json({
      success: true,
      data: {
        message: {
          id: message.id,
          senderId: message.senderId,
          recipientId: message.recipientId,
          messageType: message.messageType,
          status: message.status,
          sentAt: message.sentAt,
          isEdited: message.isEdited,
          editedAt: message.editedAt,
        },
      },
    });
  })
);

/**
 * DELETE /api/v1/messages/:messageId
 * Delete a message (soft delete)
 */
router.delete(
  '/:messageId',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { messageId } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(messageId)) {
      throw new AppError('Invalid message ID format', 400, 'INVALID_MESSAGE_ID');
    }

    await messageService.deleteMessage(messageId, userId);

    logger.info('Message deleted via REST API', {
      messageId,
      userId,
    });

    res.status(200).json({
      success: true,
      message: 'Message deleted successfully',
    });
  })
);

/**
 * POST /api/v1/messages/:messageId/delivered
 * Mark a message as delivered
 */
router.post(
  '/:messageId/delivered',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { messageId } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(messageId)) {
      throw new AppError('Invalid message ID format', 400, 'INVALID_MESSAGE_ID');
    }

    await messageService.markAsDelivered(messageId, userId);

    res.status(200).json({
      success: true,
      message: 'Message marked as delivered',
    });
  })
);

/**
 * POST /api/v1/messages/:messageId/read
 * Mark a message as read
 */
router.post(
  '/:messageId/read',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { messageId } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(messageId)) {
      throw new AppError('Invalid message ID format', 400, 'INVALID_MESSAGE_ID');
    }

    await messageService.markAsRead(messageId, userId);

    res.status(200).json({
      success: true,
      message: 'Message marked as read',
    });
  })
);

/**
 * POST /api/v1/messages/read
 * Mark multiple messages as read
 */
router.post(
  '/read',
  authenticate,
  validateBody(
    z.object({
      messageIds: z.array(z.string().uuid()).min(1, 'At least one message ID is required'),
      senderId: z.string().uuid('Invalid sender ID format'),
    })
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { messageIds, senderId } = req.body;

    await messageService.markMultipleAsRead(messageIds, userId);

    logger.info('Multiple messages marked as read via REST API', {
      count: messageIds.length,
      userId,
      senderId,
    });

    res.status(200).json({
      success: true,
      message: 'Messages marked as read',
    });
  })
);

/**
 * GET /api/v1/messages/unread/count
 * Get unread message count
 */
router.get(
  '/unread/count',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const totalUnread = await messageService.getUnreadCount(userId);
    const unreadPerConversation = await messageService.getUnreadCountPerConversation(userId);

    res.status(200).json({
      success: true,
      data: {
        total: totalUnread,
        perConversation: unreadPerConversation,
      },
    });
  })
);

export default router;
