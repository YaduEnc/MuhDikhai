import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bugReportService from '../services/bugReport.service';
import logger from '../utils/logger';
import { authenticate, isAdmin } from '../middleware/auth.middleware';

const router = Router();

// Ensure upload directory exists.
// This runs at import time, so an unhandled throw here takes down the entire
// API rather than just this route — which is exactly what happened when the
// container's non-root user could not create /app/public. Degrade instead:
// screenshot uploads fail later with a clear error, the rest of the API boots.
const UPLOADS_DIR = path.join(__dirname, '../../public/uploads/bug_screenshots');
try {
    if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
} catch (error) {
    logger.error('Could not create bug screenshot directory; uploads will fail', {
        dir: UPLOADS_DIR,
        error: error instanceof Error ? error.message : 'Unknown error',
    });
}

/**
 * @route   POST /api/v1/bugs/report
 * @desc    Submit a new bug report with a screenshot
 * @access  Public (or Authenticated depending on requirements, making it public for ease)
 */
router.post('/report', async (req, res) => {
    try {
        const { title, description, screenshotBase64, deviceInfo, reporterName, reporterEmail } = req.body;

        if (!title || !description) {
            res.status(400).json({ success: false, error: 'Title and description are required' });
            return;
        }

        let screenshotUrl = undefined;

        // Extract and save the base64 image if provided
        if (screenshotBase64 && screenshotBase64.startsWith('data:image/')) {
            const matches = screenshotBase64.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
            
            if (matches && matches.length === 3) {
                const extension = matches[1] === 'jpeg' ? 'jpg' : matches[1];
                const base64Data = matches[2];
                const buffer = Buffer.from(base64Data, 'base64');
                
                // Generate unique filename
                const filename = `bug_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${extension}`;
                const filepath = path.join(UPLOADS_DIR, filename);
                
                fs.writeFileSync(filepath, buffer);
                screenshotUrl = `/uploads/bug_screenshots/${filename}`;
            }
        }

        const report = await bugReportService.createReport({
            title,
            description,
            screenshotUrl,
            deviceInfo,
            reporterName,
            reporterEmail
        });

        res.status(201).json({ success: true, report });
    } catch (error) {
        logger.error('Error in bug report route', { error });
        res.status(500).json({ success: false, error: 'Failed to submit bug report' });
    }
});

/**
 * @route   GET /api/v1/bugs
 * @desc    Get all bug reports
 * @access  Admin
 */
router.get('/', authenticate, isAdmin, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;
        
        const result = await bugReportService.getAllReports(limit, offset);
        res.json(result);
    } catch (error) {
        logger.error('Error fetching bug reports', { error });
        res.status(500).json({ success: false, error: 'Failed to fetch bug reports' });
    }
});

/**
 * @route   PATCH /api/v1/bugs/:id/status
 * @desc    Update bug report status
 * @access  Admin
 */
router.patch('/:id/status', authenticate, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['pending', 'resolved', 'dismissed'].includes(status)) {
            res.status(400).json({ success: false, error: 'Invalid status' });
            return;
        }

        const report = await bugReportService.updateReportStatus(id, status as 'resolved' | 'dismissed');
        res.json({ success: true, report });
    } catch (error) {
        logger.error('Error updating bug report status', { error });
        res.status(500).json({ success: false, error: 'Failed to update bug report' });
    }
});

export default router;
