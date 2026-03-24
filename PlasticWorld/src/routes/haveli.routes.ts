import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import haveliService, { HAVELI_THEMES } from '../services/haveli.service';
import logger from '../utils/logger';

const router = Router();

/**
 * POST /api/v1/havelis — Create a new Haveli
 */
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, description, themeId, privacyType, maxMembers } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      res.status(400).json({ success: false, error: { message: 'Name must be at least 2 characters' } });
      return;
    }

    if (name.trim().length > 60) {
      res.status(400).json({ success: false, error: { message: 'Name cannot exceed 60 characters' } });
      return;
    }

    if (description && description.length > 300) {
      res.status(400).json({ success: false, error: { message: 'Description cannot exceed 300 characters' } });
      return;
    }

    if (themeId && !HAVELI_THEMES.find(t => t.id === themeId)) {
      res.status(400).json({ success: false, error: { message: 'Invalid theme' } });
      return;
    }

    if (privacyType && !['public', 'invite'].includes(privacyType)) {
      res.status(400).json({ success: false, error: { message: 'Privacy type must be "public" or "invite"' } });
      return;
    }

    // Limit how many active Havelis a user can create
    const myHavelis = await haveliService.listMyHavelis(userId);
    const myCreatedCount = myHavelis.filter(h => h.creatorId === userId).length;
    if (myCreatedCount >= 5) {
      res.status(400).json({ success: false, error: { message: 'You can own at most 5 Havelis at a time' } });
      return;
    }

    const haveli = await haveliService.createHaveli({
      creatorId: userId,
      name: name.trim(),
      description: description?.trim(),
      themeId,
      privacyType,
      maxMembers: maxMembers ? Math.min(Math.max(2, maxMembers), 100) : 50,
    });

    res.status(201).json({ success: true, data: { haveli } });
  } catch (error) {
    logger.error('Create Haveli route error', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to create Haveli' } });
  }
});

/**
 * GET /api/v1/havelis — List public Havelis (The Bazaar)
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const result = await haveliService.listPublicHavelis(limit, offset);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('List Havelis route error', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to list Havelis' } });
  }
});

/**
 * GET /api/v1/havelis/mine — List Havelis the user is a member of
 */
router.get('/mine', authenticate, async (req: Request, res: Response) => {
  try {
    const havelis = await haveliService.listMyHavelis(req.user!.id);
    res.json({ success: true, data: { havelis } });
  } catch (error) {
    logger.error('List my Havelis route error', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to list your Havelis' } });
  }
});

/**
 * GET /api/v1/havelis/themes — Get available themes
 */
router.get('/themes', authenticate, async (_req: Request, res: Response) => {
  res.json({ success: true, data: { themes: HAVELI_THEMES } });
});

/**
 * GET /api/v1/havelis/join/:inviteCode — Join by invite code
 */
router.post('/join/:inviteCode', authenticate, async (req: Request, res: Response) => {
  try {
    const { inviteCode } = req.params;
    const userId = req.user!.id;

    const haveli = await haveliService.getHaveliByInviteCode(inviteCode);
    if (!haveli) {
      res.status(404).json({ success: false, error: { message: 'Invalid invite code' } });
      return;
    }

    const result = await haveliService.joinHaveli(haveli.id, userId);
    if (!result.success) {
      res.status(400).json({ success: false, error: { message: result.error } });
      return;
    }

    res.json({ success: true, data: { haveli } });
  } catch (error) {
    logger.error('Join by invite code route error', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to join Haveli' } });
  }
});

/**
 * GET /api/v1/havelis/:id — Get Haveli details
 */
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const haveli = await haveliService.getHaveliById(req.params.id);
    if (!haveli) {
      res.status(404).json({ success: false, error: { message: 'Haveli not found' } });
      return;
    }

    const membership = await haveliService.isMember(req.params.id, req.user!.id);
    const members = await haveliService.getMembers(req.params.id);

    res.json({
      success: true,
      data: {
        haveli,
        membership,
        members,
      },
    });
  } catch (error) {
    logger.error('Get Haveli route error', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to get Haveli' } });
  }
});

/**
 * POST /api/v1/havelis/:id/join — Join a Haveli
 */
router.post('/:id/join', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await haveliService.joinHaveli(req.params.id, req.user!.id);
    if (!result.success) {
      res.status(400).json({ success: false, error: { message: result.error } });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Join Haveli route error', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to join Haveli' } });
  }
});

/**
 * POST /api/v1/havelis/:id/leave — Leave a Haveli
 */
router.post('/:id/leave', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await haveliService.leaveHaveli(req.params.id, req.user!.id);
    res.json({ success: true, data: { deleted: result.deleted || false } });
  } catch (error) {
    logger.error('Leave Haveli route error', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to leave Haveli' } });
  }
});

/**
 * PUT /api/v1/havelis/:id — Update Haveli settings (admin only)
 */
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { name, description, themeId, privacyType, isLocked, pinnedMessage } = req.body;

    if (name !== undefined && (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 60)) {
      res.status(400).json({ success: false, error: { message: 'Name must be 2-60 characters' } });
      return;
    }

    if (themeId !== undefined && !HAVELI_THEMES.find(t => t.id === themeId)) {
      res.status(400).json({ success: false, error: { message: 'Invalid theme' } });
      return;
    }

    const result = await haveliService.updateHaveli(req.params.id, req.user!.id, {
      name, description, themeId, privacyType, isLocked, pinnedMessage,
    });

    if (!result.success) {
      res.status(403).json({ success: false, error: { message: result.error } });
      return;
    }

    res.json({ success: true, data: { haveli: result.haveli } });
  } catch (error) {
    logger.error('Update Haveli route error', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to update Haveli' } });
  }
});

/**
 * POST /api/v1/havelis/:id/kick/:userId — Kick a member
 */
router.post('/:id/kick/:userId', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await haveliService.kickMember(req.params.id, req.user!.id, req.params.userId);
    if (!result.success) {
      res.status(403).json({ success: false, error: { message: result.error } });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Kick member route error', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to kick member' } });
  }
});

/**
 * DELETE /api/v1/havelis/:id — Delete a Haveli
 */
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await haveliService.deleteHaveli(req.params.id, req.user!.id);
    if (!result.success) {
      res.status(403).json({ success: false, error: { message: result.error } });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Delete Haveli route error', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to delete Haveli' } });
  }
});

/**
 * GET /api/v1/havelis/:id/messages — Get recent messages
 */
router.get('/:id/messages', authenticate, async (req: Request, res: Response) => {
  try {
    // Verify membership
    const membership = await haveliService.isMember(req.params.id, req.user!.id);
    if (!membership.isMember) {
      res.status(403).json({ success: false, error: { message: 'You are not a member of this Haveli' } });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const before = req.query.before as string | undefined;

    const messages = await haveliService.getRecentMessages(req.params.id, limit, before);
    res.json({ success: true, data: { messages } });
  } catch (error) {
    logger.error('Get messages route error', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to get messages' } });
  }
});

export default router;
