import database from '../config/database';
import redisClient from '../config/redis';
import jwtService from './jwt.service';
import logger from '../utils/logger';

export interface SessionData {
  id: string;
  userId: string;
  deviceId: string;
  accessTokenHash: string;
  refreshTokenHash: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
  isActive: boolean;
  createdAt: Date;
  lastUsedAt: Date;
}

class SessionService {
  /**
   * Create a new session
   */
  async createSession(
    userId: string,
    deviceId: string,
    accessToken: string,
    refreshToken: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<SessionData> {
    try {
      // Hash tokens for storage
      const accessTokenHash = jwtService.hashToken(accessToken);
      const refreshTokenHash = jwtService.hashToken(refreshToken);

      // Generate token pair to get expiration dates
      const tokenPair = jwtService.generateTokenPair(userId, deviceId);

      // Create session in database
      const result = await database.query<SessionData>(
        `INSERT INTO sessions (
          user_id, device_id, access_token_hash, refresh_token_hash,
          access_expires_at, refresh_expires_at, ip_address, user_agent, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING 
          id, user_id as "userId", device_id as "deviceId",
          access_token_hash as "accessTokenHash",
          refresh_token_hash as "refreshTokenHash",
          access_expires_at as "accessExpiresAt",
          refresh_expires_at as "refreshExpiresAt",
          ip_address as "ipAddress",
          user_agent as "userAgent",
          is_active as "isActive",
          created_at as "createdAt",
          last_used_at as "lastUsedAt"`,
        [
          userId,
          deviceId,
          accessTokenHash,
          refreshTokenHash,
          tokenPair.accessExpiresAt,
          tokenPair.refreshExpiresAt,
          ipAddress || null,
          userAgent || null,
          true,
        ]
      );

      const session = result.rows[0];

      // Store session in Redis for fast access
      const redisKey = `session:${userId}:${deviceId}`;
      await redisClient.set(
        redisKey,
        JSON.stringify({
          id: session.id,
          userId: session.userId,
          deviceId: session.deviceId,
          isActive: session.isActive,
        }),
        parseInt(process.env.REDIS_TTL_SESSION || '604800', 10)
      );

      logger.info('Session created successfully', {
        userId,
        deviceId,
        sessionId: session.id,
      });

      return session;
    } catch (error) {
      logger.error('Failed to create session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        deviceId,
      });
      throw error;
    }
  }

  /**
   * Get session by access token hash
   */
  async getSessionByAccessToken(accessTokenHash: string): Promise<SessionData | null> {
    try {
      const result = await database.query<SessionData>(
        `SELECT 
          id, user_id as "userId", device_id as "deviceId",
          access_token_hash as "accessTokenHash",
          refresh_token_hash as "refreshTokenHash",
          access_expires_at as "accessExpiresAt",
          refresh_expires_at as "refreshExpiresAt",
          ip_address as "ipAddress",
          user_agent as "userAgent",
          is_active as "isActive",
          created_at as "createdAt",
          last_used_at as "lastUsedAt"
        FROM sessions
        WHERE access_token_hash = $1 AND is_active = true
        LIMIT 1`,
        [accessTokenHash]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get session by access token', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get session by refresh token hash
   */
  async getSessionByRefreshToken(refreshTokenHash: string): Promise<SessionData | null> {
    try {
      const result = await database.query<SessionData>(
        `SELECT 
          id, user_id as "userId", device_id as "deviceId",
          access_token_hash as "accessTokenHash",
          refresh_token_hash as "refreshTokenHash",
          access_expires_at as "accessExpiresAt",
          refresh_expires_at as "refreshExpiresAt",
          ip_address as "ipAddress",
          user_agent as "userAgent",
          is_active as "isActive",
          created_at as "createdAt",
          last_used_at as "lastUsedAt"
        FROM sessions
        WHERE refresh_token_hash = $1 AND is_active = true
        LIMIT 1`,
        [refreshTokenHash]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get session by refresh token', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update session last used timestamp
   */
  async updateLastUsed(sessionId: string): Promise<void> {
    try {
      await database.query(
        'UPDATE sessions SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
        [sessionId]
      );
    } catch (error) {
      logger.error('Failed to update session last used', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId,
      });
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string): Promise<SessionData[]> {
    try {
      const result = await database.query<SessionData>(
        `SELECT 
          s.id, s.user_id as "userId", s.device_id as "deviceId",
          s.access_token_hash as "accessTokenHash",
          s.refresh_token_hash as "refreshTokenHash",
          s.access_expires_at as "accessExpiresAt",
          s.refresh_expires_at as "refreshExpiresAt",
          s.ip_address as "ipAddress",
          s.user_agent as "userAgent",
          s.is_active as "isActive",
          s.created_at as "createdAt",
          s.last_used_at as "lastUsedAt",
          d.device_name as "deviceName",
          d.device_type as "deviceType"
        FROM sessions s
        JOIN devices d ON s.device_id = d.id
        WHERE s.user_id = $1 AND s.is_active = true
        ORDER BY s.last_used_at DESC`,
        [userId]
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to get user sessions', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      throw error;
    }
  }

  /**
   * Revoke session (logout)
   */
  async revokeSession(sessionId: string, userId: string): Promise<void> {
    try {
      await database.query(
        'UPDATE sessions SET is_active = false WHERE id = $1 AND user_id = $2',
        [sessionId, userId]
      );

      // Remove from Redis
      const sessions = await this.getUserSessions(userId);
      const session = sessions.find((s) => s.id === sessionId);
      if (session) {
        const redisKey = `session:${userId}:${session.deviceId}`;
        await redisClient.del(redisKey);
      }

      logger.info('Session revoked', { sessionId, userId });
    } catch (error) {
      logger.error('Failed to revoke session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Revoke all sessions for a user (except current)
   */
  async revokeAllSessions(userId: string, exceptDeviceId?: string): Promise<void> {
    try {
      if (exceptDeviceId) {
        await database.query(
          'UPDATE sessions SET is_active = false WHERE user_id = $1 AND device_id != $2',
          [userId, exceptDeviceId]
        );
      } else {
        await database.query('UPDATE sessions SET is_active = false WHERE user_id = $1', [
          userId,
        ]);
      }

      logger.info('All sessions revoked', { userId, exceptDeviceId });
    } catch (error) {
      logger.error('Failed to revoke all sessions', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      throw error;
    }
  }
}

// Export singleton instance
const sessionService = new SessionService();
export default sessionService;
