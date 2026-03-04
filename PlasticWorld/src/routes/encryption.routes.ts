import { Router, Request, Response } from 'express';
import keyExchangeService from '../services/keyExchange.service';
import keyStorageService from '../services/keyStorage.service';
import { authenticate } from '../middleware/auth.middleware';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/errorHandler';
import logger from '../utils/logger';

const router = Router();

/**
 * POST /api/v1/encryption/keys/initialize
 * Initialize encryption keys for current device
 */
router.post(
  '/keys/initialize',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const deviceId = req.deviceId!;

    const keys = await keyExchangeService.initializeKeys(userId, deviceId);

    logger.info('Encryption keys initialized', {
      userId,
      deviceId,
      prekeyCount: keys.prekeyCount,
    });

    res.status(201).json({
      success: true,
      data: {
        keys: {
          identityKeyPublic: keys.identityKeyPublic,
          signedPreKeyPublic: keys.signedPreKeyPublic,
          signedPreKeySignature: keys.signedPreKeySignature,
          prekeyCount: keys.prekeyCount,
        },
      },
    });
  })
);

/**
 * GET /api/v1/encryption/keys/prekey-bundle/:userId/:deviceId
 * Get prekey bundle for a user's device (for X3DH key exchange)
 */
router.get(
  '/keys/prekey-bundle/:userId/:deviceId',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, deviceId } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId) || !uuidRegex.test(deviceId)) {
      throw new AppError('Invalid user ID or device ID format', 400, 'INVALID_ID');
    }

    const bundle = await keyExchangeService.getPreKeyBundle(userId, deviceId);

    if (!bundle) {
      throw new AppError('Prekey bundle not found for this user/device', 404, 'PREKEY_BUNDLE_NOT_FOUND');
    }

    res.status(200).json({
      success: true,
      data: {
        bundle,
      },
    });
  })
);

/**
 * POST /api/v1/encryption/session/establish
 * Establish encryption session with another user
 * Body: { recipientUserId, recipientDeviceId }
 */
router.post(
  '/session/establish',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const senderUserId = req.user!.id;
    const senderDeviceId = req.deviceId!;
    const { recipientUserId, recipientDeviceId } = req.body;

    if (!recipientUserId || !recipientDeviceId) {
      throw new AppError('recipientUserId and recipientDeviceId are required', 400, 'MISSING_PARAMS');
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(recipientUserId) || !uuidRegex.test(recipientDeviceId)) {
      throw new AppError('Invalid recipient user ID or device ID format', 400, 'INVALID_ID');
    }

    const session = await keyExchangeService.establishSession(
      senderUserId,
      senderDeviceId,
      recipientUserId,
      recipientDeviceId
    );

    logger.info('Encryption session established', {
      senderUserId,
      recipientUserId,
      sessionId: session.sessionId,
    });

    res.status(201).json({
      success: true,
      data: {
        session: {
          sessionId: session.sessionId,
          rootKey: session.rootKey,
          sendingChainKey: session.sendingChainKey,
          receivingChainKey: session.receivingChainKey,
        },
      },
    });
  })
);

/**
 * POST /api/v1/encryption/keys/rotate
 * Rotate encryption keys for current device
 */
router.post(
  '/keys/rotate',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const deviceId = req.deviceId!;

    const keys = await keyExchangeService.rotateKeys(userId, deviceId);

    logger.info('Encryption keys rotated', {
      userId,
      deviceId,
      prekeyCount: keys.prekeyCount,
    });

    res.status(200).json({
      success: true,
      data: {
        keys: {
          identityKeyPublic: keys.identityKeyPublic,
          signedPreKeyPublic: keys.signedPreKeyPublic,
          signedPreKeySignature: keys.signedPreKeySignature,
          prekeyCount: keys.prekeyCount,
        },
      },
    });
  })
);

/**
 * GET /api/v1/encryption/keys
 * Get all encryption keys for current user
 */
router.get(
  '/keys',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const keys = await keyStorageService.getUserKeys(userId);

    res.status(200).json({
      success: true,
      data: {
        keys: keys.map((key) => ({
          id: key.id,
          deviceId: key.deviceId,
          prekeyCount: key.prekeyCount,
          keyCreatedAt: key.keyCreatedAt,
          keyExpiresAt: key.keyExpiresAt,
          isActive: key.isActive,
        })),
      },
    });
  })
);

/**
 * DELETE /api/v1/encryption/keys/:deviceId
 * Deactivate encryption keys for a device
 */
router.delete(
  '/keys/:deviceId',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { deviceId } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(deviceId)) {
      throw new AppError('Invalid device ID format', 400, 'INVALID_DEVICE_ID');
    }

    await keyStorageService.deactivateKeys(userId, deviceId);

    logger.info('Encryption keys deactivated', {
      userId,
      deviceId,
    });

    res.status(200).json({
      success: true,
      message: 'Encryption keys deactivated successfully',
    });
  })
);

export default router;
