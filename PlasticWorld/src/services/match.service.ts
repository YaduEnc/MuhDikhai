import database from '../config/database';
import logger from '../utils/logger';

export interface RandomMatch {
    id: string;
    userIdA: string;
    userIdB: string;
    roomId: string;
    sharedTopic?: string;
    createdAt: Date;
    partner?: {
        id: string;
        name: string;
        profilePictureUrl?: string;
        auraPoints?: number;
    };
}

class MatchService {
    /**
     * Record a new random match in the database
     */
    async recordMatch(userAId: string, userBId: string, roomId: string, topic?: string): Promise<void> {
        try {
            // Ensure IDs are in consistent order to prevent accidental duplicates (though gen_random_uuid helps)
            const [id1, id2] = userAId < userBId ? [userAId, userBId] : [userBId, userAId];

            await database.query(
                `INSERT INTO random_matches (user_id_a, user_id_b, room_id, shared_topic)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT DO NOTHING`,
                [id1, id2, roomId, topic]
            );
        } catch (error) {
            logger.error('Failed to record match in database', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userAId,
                userBId,
                roomId
            });
        }
    }

    /**
     * Fetch recent random matches for a user
     */
    async getRecentMatches(userId: string, limit: number = 10): Promise<RandomMatch[]> {
        try {
            const result = await database.query(
                `SELECT * FROM (
                    SELECT DISTINCT ON (u.id) rm.id, rm.user_id_a, rm.user_id_b, rm.room_id, rm.shared_topic, rm.created_at,
                        u.id as partner_id, u.name as partner_name, u.profile_picture_url as partner_pic, u.aura_points as partner_aura
                    FROM random_matches rm
                    JOIN users u ON (u.id = CASE WHEN rm.user_id_a = $1 THEN rm.user_id_b ELSE rm.user_id_a END)
                    WHERE rm.user_id_a = $1 OR rm.user_id_b = $1
                    ORDER BY u.id, rm.created_at DESC
                ) sub
                ORDER BY created_at DESC
                LIMIT $2`,
                [userId, limit]
            );

            return result.rows.map(row => ({
                id: row.id,
                userIdA: row.user_id_a,
                userIdB: row.user_id_b,
                roomId: row.room_id,
                sharedTopic: row.shared_topic,
                createdAt: row.created_at,
                partner: {
                    id: row.partner_id,
                    name: row.partner_name,
                    profilePictureUrl: row.partner_pic,
                    auraPoints: row.partner_aura
                }
            }));
        } catch (error) {
            logger.error('Failed to fetch recent matches', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId
            });
            return [];
        }
    }
}

export default new MatchService();
