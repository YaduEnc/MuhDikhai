import database from '../config/database';
import logger from '../utils/logger';

export interface BugReport {
    id: string;
    reporterName?: string;
    reporterEmail?: string;
    title: string;
    description: string;
    screenshotUrl?: string;
    deviceInfo?: any;
    status: 'pending' | 'resolved' | 'dismissed';
    createdAt: Date;
}

export interface CreateBugReportData {
    reporterName?: string;
    reporterEmail?: string;
    title: string;
    description: string;
    screenshotUrl?: string;
    deviceInfo?: any;
}

class BugReportService {
    /**
     * Create a new bug report
     */
    async createReport(data: CreateBugReportData): Promise<BugReport> {
        try {
            const result = await database.query<BugReport>(
                `INSERT INTO bug_reports (
          reporter_name, reporter_email, title, description, screenshot_url, device_info
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING 
          id, reporter_name as "reporterName", reporter_email as "reporterEmail",
          title, description, screenshot_url as "screenshotUrl", device_info as "deviceInfo", status,
          created_at as "createdAt"`,
                [data.reporterName, data.reporterEmail, data.title, data.description, data.screenshotUrl, data.deviceInfo]
            );

            const report = result.rows[0];

            logger.info('Bug report created successfully', {
                reportId: report.id,
                title: report.title,
            });

            return report;
        } catch (error) {
            logger.error('Failed to create bug report', {
                error: error instanceof Error ? error.message : 'Unknown error',
                title: data.title,
            });
            throw error;
        }
    }

    /**
     * Get all bug reports (admin only)
     */
    async getAllReports(limit: number = 50, offset: number = 0): Promise<{ reports: any[]; total: number }> {
        try {
            const countResult = await database.query<{ count: string }>(
                'SELECT COUNT(*) as count FROM bug_reports'
            );
            const total = parseInt(countResult.rows[0].count, 10);

            const result = await database.query<any>(
                `SELECT 
          id, title, description, screenshot_url as "screenshotUrl",
          device_info as "deviceInfo", status, created_at as "createdAt",
          reporter_name as "reporterName", reporter_email as "reporterEmail"
        FROM bug_reports
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2`,
                [limit, offset]
            );

            return {
                reports: result.rows,
                total,
            };
        } catch (error) {
            logger.error('Failed to get bug reports', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    /**
     * Update report status
     */
    async updateReportStatus(reportId: string, status: 'resolved' | 'dismissed'): Promise<BugReport> {
        try {
            const result = await database.query<BugReport>(
                `UPDATE bug_reports 
        SET status = $1
        WHERE id = $2
        RETURNING 
          id, reporter_name as "reporterName", reporter_email as "reporterEmail",
          title, description, screenshot_url as "screenshotUrl", device_info as "deviceInfo", status,
          created_at as "createdAt"`,
                [status, reportId]
            );

            if (result.rows.length === 0) {
                throw new Error('Bug report not found');
            }

            logger.info('Bug report status updated', { reportId, status });

            return result.rows[0];
        } catch (error) {
            logger.error('Failed to update bug report status', {
                error: error instanceof Error ? error.message : 'Unknown error',
                reportId,
            });
            throw error;
        }
    }
}

const bugReportService = new BugReportService();
export default bugReportService;
