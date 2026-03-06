import { Router } from 'express';
import reportService from '../services/report.service';
import { body, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware';
import logger from '../utils/logger';

const router = Router();

/**
 * @route   POST /api/v1/reports
 * @desc    Create a new report
 * @access  Private
 */
router.post(
    '/',
    authenticate,
    [
        body('reportedId').isUUID().withMessage('Invalid reported user ID'),
        body('reason').notEmpty().withMessage('Reason is required'),
        body('details').optional().isString(),
    ],
    async (req: any, res: any) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const { reportedId, reason, details } = req.body;
            const reporterId = req.user.id;

            const report = await reportService.createReport({
                reporterId,
                reportedId,
                reason,
                details,
            });

            res.status(201).json(report);
        } catch (error) {
            logger.error('Error creating report:', error);
            res.status(500).json({ error: 'Failed to create report' });
        }
    }
);

export default router;
