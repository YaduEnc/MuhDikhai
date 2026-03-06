import { Router } from 'express';
import reportService from '../services/report.service';
import { authenticate, isAdmin } from '../middleware/auth.middleware';
import database from '../config/database';
import redis from '../config/redis';
import logger from '../utils/logger';

const router = Router();

// Secure all admin routes
router.use(authenticate);
router.use(isAdmin);

/**
 * @route   GET /api/v1/admin/stats/live
 * @desc    Get live server stats from Redis and Memory
 * @access  Admin
 */
router.get('/stats/live', async (_req: any, res: any) => {
    try {
        // Get online count from Redis
        const onlineCount = await redis.keys('user:status:*');

        // In a real scenario, we might have more complex socket room tracking
        // For now, let's get some basic session stats
        const activeSessionsResult = await database.query(
            "SELECT COUNT(*) as count FROM sessions WHERE is_active = true AND access_expires_at > CURRENT_TIMESTAMP"
        );

        res.json({
            onlineUsers: onlineCount.length,
            activeSessions: parseInt(activeSessionsResult.rows[0].count, 10),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error fetching live stats:', error);
        res.status(500).json({ error: 'Failed to fetch live stats' });
    }
});

/**
 * @route   GET /api/v1/admin/stats/growth
 * @desc    Get user growth metrics
 * @access  Admin
 */
router.get('/stats/growth', async (_req: any, res: any) => {
    try {
        const totalUsersResult = await database.query("SELECT COUNT(*) as count FROM users");
        const newUsersTodayResult = await database.query(
            "SELECT COUNT(*) as count FROM users WHERE created_at >= CURRENT_DATE"
        );
        const topVibesResult = await database.query(
            "SELECT bio as vibe, COUNT(*) as count FROM users WHERE bio IS NOT NULL GROUP BY bio ORDER BY count DESC LIMIT 5"
        );

        res.json({
            totalUsers: parseInt(totalUsersResult.rows[0].count, 10),
            newUsersToday: parseInt(newUsersTodayResult.rows[0].count, 10),
            topVibes: topVibesResult.rows
        });
    } catch (error) {
        logger.error('Error fetching growth stats:', error);
        res.status(500).json({ error: 'Failed to fetch growth stats' });
    }
});

/**
 * @route   GET /api/v1/admin/reports
 * @desc    Get all reports
 * @access  Admin
 */
router.get('/reports', async (req: any, res: any) => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;
        const result = await reportService.getAllReports(limit, offset);
        res.json(result);
    } catch (error) {
        logger.error('Error fetching reports:', error);
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
});

/**
 * @route   PATCH /api/v1/admin/reports/:id
 * @desc    Update report status
 * @access  Admin
 */
router.patch('/reports/:id', async (req: any, res: any) => {
    try {
        const { status } = req.body;
        if (!['resolved', 'dismissed'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        const report = await reportService.updateReportStatus(req.params.id, status);
        res.json(report);
    } catch (error) {
        logger.error('Error updating report:', error);
        res.status(500).json({ error: 'Failed to update report' });
    }
});

/**
 * @route   POST /api/v1/admin/users/:id/ban
 * @desc    Ban a user (deactivate)
 * @access  Admin
 */
router.post('/users/:id/ban', async (req: any, res: any) => {
    try {
        const userId = req.params.id;
        // In this project, deactivate is equivalent to ban
        await database.query("UPDATE users SET is_active = false WHERE id = $1", [userId]);

        // Also kill their sessions
        await database.query("UPDATE sessions SET is_active = false WHERE user_id = $1", [userId]);

        logger.info(`User ${userId} banned by admin ${req.user.id}`);
        res.json({ message: 'User banned' });
    } catch (error) {
        logger.error('Error banning user:', error);
        res.status(500).json({ error: 'Failed to ban user' });
    }
});

export default router;
