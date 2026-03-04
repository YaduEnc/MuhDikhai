import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { upload } from '../middleware/multer';
import { trackRoomMedia } from '../config/socket';
import logger from '../utils/logger';

const router = Router();

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

    // Return the URL to the uploaded file
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const mediaUrl = `${baseUrl}/uploads/${req.file.filename}`;

    // Track media for ephemeral room cleanup if roomId is provided
    const roomId = req.body.roomId;
    if (roomId) {
      trackRoomMedia(roomId, req.file.filename);
    }

    logger.info('Chat media uploaded', {
      userId: req.user!.id,
      filename: req.file.filename,
      size: req.file.size,
      roomId,
    });

    res.status(200).json({
      success: true,
      data: {
        url: mediaUrl,
        type: req.file.mimetype.startsWith('image/') ? 'image' : 'file',
      },
    });
  })
);

export default router;
