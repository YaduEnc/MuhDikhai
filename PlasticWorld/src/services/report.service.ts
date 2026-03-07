import database from '../config/database';
import logger from '../utils/logger';

export interface Report {
    id: string;
    reporterId: string;
    reportedId: string;
    reason: string;
    details?: string;
    status: 'pending' | 'resolved' | 'dismissed';
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateReportData {
    reporterId: string;
    reportedId: string;
    reason: string;
    details?: string;
}

class ReportService {
    /**
     * Create a new report
     */
    async createReport(data: CreateReportData): Promise<Report> {
        try {
            const result = await database.query<Report>(
                `INSERT INTO reports (
          reporter_id, reported_id, reason, details
        ) VALUES ($1, $2, $3, $4)
        RETURNING 
          id, reporter_id as "reporterId", reported_id as "reportedId",
          reason, details, status,
          created_at as "createdAt", updated_at as "updatedAt"`,
                [data.reporterId, data.reportedId, data.reason, data.details || null]
            );

            const report = result.rows[0];

            logger.info('Report created successfully', {
                reportId: report.id,
                reporterId: report.reporterId,
                reportedId: report.reportedId,
            });

            return report;
        } catch (error) {
            logger.error('Failed to create report', {
                error: error instanceof Error ? error.message : 'Unknown error',
                reporterId: data.reporterId,
                reportedId: data.reportedId,
            });
            throw error;
        }
    }

    /**
     * Get all reports (admin only)
     */
    async getAllReports(limit: number = 50, offset: number = 0): Promise<{ reports: any[]; total: number }> {
        try {
            // Get total count
            const countResult = await database.query<{ count: string }>(
                'SELECT COUNT(*) as count FROM reports'
            );
            const total = parseInt(countResult.rows[0].count, 10);

            // Get reports with user info
            const result = await database.query<any>(
                `SELECT 
          r.id, r.reason, r.details, r.status,
          r.created_at as "createdAt", r.updated_at as "updatedAt",
          u1.id as "reporterId", u1.name as "reporterName", u1.email as "reporterEmail", u1.aura_points as "reporterAura",
          u2.id as "reportedId", u2.name as "reportedName", u2.email as "reportedEmail", u2.aura_points as "reportedAura"
        FROM reports r
        JOIN users u1 ON r.reporter_id = u1.id
        JOIN users u2 ON r.reported_id = u2.id
        ORDER BY r.created_at DESC
        LIMIT $1 OFFSET $2`,
                [limit, offset]
            );

            return {
                reports: result.rows,
                total,
            };
        } catch (error) {
            logger.error('Failed to get reports', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    /**
     * Update report status
     */
    async updateReportStatus(reportId: string, status: 'resolved' | 'dismissed'): Promise<Report> {
        try {
            const result = await database.query<Report>(
                `UPDATE reports 
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING 
          id, reporter_id as "reporterId", reported_id as "reportedId",
          reason, details, status,
          created_at as "createdAt", updated_at as "updatedAt"`,
                [status, reportId]
            );

            if (result.rows.length === 0) {
                throw new Error('Report not found');
            }

            logger.info('Report status updated', { reportId, status });

            return result.rows[0];
        } catch (error) {
            logger.error('Failed to update report status', {
                error: error instanceof Error ? error.message : 'Unknown error',
                reportId,
            });
            throw error;
        }
    }
}

const reportService = new ReportService();
export default reportService;
