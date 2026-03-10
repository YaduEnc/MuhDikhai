import { Router, Request, Response } from 'express';
import messageService from '../services/message.service';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { upload } from '../middleware/multer';
import { trackRoomMedia } from '../config/socket';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /api/v1/messages/unread-counts
 * Get unread message counts per conversation
 */
router.get(
  '/unread-counts',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const counts = await messageService.getUnreadCountPerConversation(userId);

    res.status(200).json({
      success: true,
      data: { counts },
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
 * Get conversation history with a specific user
 */
router.get(
  '/:userId',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const currentUserId = req.user!.id;
    const { userId: otherUserId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const beforeMessageId = req.query.beforeMessageId as string;

    const { messages, total } = await messageService.getConversation(
      currentUserId,
      otherUserId,
      limit,
      offset,
      beforeMessageId
    );

    res.status(200).json({
      success: true,
      data: {
        messages: messages.map(m => ({
          ...m,
          encryptedContent: m.encryptedContent ? Buffer.from(m.encryptedContent as any).toString('base64') : undefined,
          encryptedKey: m.encryptedKey ? Buffer.from(m.encryptedKey as any).toString('base64') : undefined,
        })),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      },
    });


  })
);

/**
 * POST /api/v1/messages/upload
 * Upload ephemeral media for chat (images)
 */
router.post(
  '/upload',
  authenticate,
  upload.single('media'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new AppError('No file uploaded', 400, 'NO_FILE');
    }

    // Return the URL to the uploaded file (respecting proxies/tunnels)
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('x-forwarded-host') || req.get('host');
    const baseUrl = `${protocol}://${host}`;
    const mediaUrl = `${baseUrl}/uploads/${req.file.filename}`;

    // Track media for ephemeral room cleanup if roomId is provided
    const roomId = req.body.roomId;
    if (roomId) {
      trackRoomMedia(roomId, req.file.filename);
    }

    const isImage = req.file.mimetype.startsWith('image/');
    const isVideo = req.file.mimetype.startsWith('video/');

    logger.info('Chat media uploaded', {
      userId: req.user!.id,
      filename: req.file.filename,
      size: req.file.size,
      roomId,
      type: isImage ? 'image' : isVideo ? 'video' : 'file'
    });

    res.status(200).json({
      success: true,
      data: {
        url: mediaUrl,
        type: isImage ? 'image' : isVideo ? 'video' : 'file',
      },
    });
  })
);

export default router;
