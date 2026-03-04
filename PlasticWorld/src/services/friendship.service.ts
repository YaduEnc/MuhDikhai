import database from '../config/database';
import logger from '../utils/logger';

export interface Friendship {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: 'pending' | 'accepted' | 'denied' | 'blocked';
  requestedAt: Date;
  respondedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  // Joined user data
  requester?: {
    id: string;
    username?: string;
    name: string;
    profilePictureUrl?: string;
    status: 'online' | 'offline' | 'away';
  };
  addressee?: {
    id: string;
    username?: string;
    name: string;
    profilePictureUrl?: string;
    status: 'online' | 'offline' | 'away';
  };
}

export interface Block {
  id: string;
  blockerId: string;
  blockedId: string;
  reason?: string;
  createdAt: Date;
  // Joined user data
  blockedUser?: {
    id: string;
    username?: string;
    name: string;
    profilePictureUrl?: string;
  };
}

class FriendshipService {
  /**
   * Check if two users are friends (accepted status)
   */
  async areFriends(userId1: string, userId2: string): Promise<boolean> {
    try {
      const result = await database.query<{ count: string }>(
        `SELECT COUNT(*) as count
        FROM friendships
        WHERE status = 'accepted'
        AND (
          (requester_id = $1 AND addressee_id = $2)
          OR (requester_id = $2 AND addressee_id = $1)
        )`,
        [userId1, userId2]
      );

      return parseInt(result.rows[0].count, 10) > 0;
    } catch (error) {
      logger.error('Failed to check if users are friends', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId1,
        userId2,
      });
      throw error;
    }
  }

  /**
   * Check if a user is blocked by another user
   */
  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    try {
      const result = await database.query<{ count: string }>(
        'SELECT COUNT(*) as count FROM blocks WHERE blocker_id = $1 AND blocked_id = $2',
        [blockerId, blockedId]
      );

      return parseInt(result.rows[0].count, 10) > 0;
    } catch (error) {
      logger.error('Failed to check if user is blocked', {
        error: error instanceof Error ? error.message : 'Unknown error',
        blockerId,
        blockedId,
      });
      throw error;
    }
  }

  /**
   * Get friendship by ID
   */
  async getFriendshipById(friendshipId: string): Promise<Friendship | null> {
    try {
      const result = await database.query<Friendship>(
        `SELECT 
          f.id, f.requester_id as "requesterId", f.addressee_id as "addresseeId",
          f.status, f.requested_at as "requestedAt", f.responded_at as "respondedAt",
          f.created_at as "createdAt", f.updated_at as "updatedAt"
        FROM friendships f
        WHERE f.id = $1
        LIMIT 1`,
        [friendshipId]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get friendship by ID', {
        error: error instanceof Error ? error.message : 'Unknown error',
        friendshipId,
      });
      throw error;
    }
  }

  /**
   * Get friendship between two users
   */
  async getFriendshipBetween(
    userId1: string,
    userId2: string
  ): Promise<Friendship | null> {
    try {
      const result = await database.query<Friendship>(
        `SELECT 
          f.id, f.requester_id as "requesterId", f.addressee_id as "addresseeId",
          f.status, f.requested_at as "requestedAt", f.responded_at as "respondedAt",
          f.created_at as "createdAt", f.updated_at as "updatedAt"
        FROM friendships f
        WHERE (
          (f.requester_id = $1 AND f.addressee_id = $2)
          OR (f.requester_id = $2 AND f.addressee_id = $1)
        )
        LIMIT 1`,
        [userId1, userId2]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get friendship between users', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId1,
        userId2,
      });
      throw error;
    }
  }

  /**
   * Send friend request
   */
  async sendFriendRequest(requesterId: string, addresseeId: string): Promise<Friendship> {
    try {
      // Check if friendship already exists
      const existing = await this.getFriendshipBetween(requesterId, addresseeId);
      if (existing) {
        if (existing.status === 'pending') {
          throw new Error('Friend request already sent');
        }
        if (existing.status === 'accepted') {
          throw new Error('Users are already friends');
        }
        if (existing.status === 'blocked') {
          throw new Error('Cannot send request to blocked user');
        }
        // If denied, update to pending
        const result = await database.query<Friendship>(
          `UPDATE friendships
          SET status = 'pending', requested_at = CURRENT_TIMESTAMP, responded_at = NULL
          WHERE id = $1
          RETURNING 
            id, requester_id as "requesterId", addressee_id as "addresseeId",
            status, requested_at as "requestedAt", responded_at as "respondedAt",
            created_at as "createdAt", updated_at as "updatedAt"`,
          [existing.id]
        );
        return result.rows[0];
      }

      // Create new friendship
      const result = await database.query<Friendship>(
        `INSERT INTO friendships (requester_id, addressee_id, status)
        VALUES ($1, $2, 'pending')
        RETURNING 
          id, requester_id as "requesterId", addressee_id as "addresseeId",
          status, requested_at as "requestedAt", responded_at as "respondedAt",
          created_at as "createdAt", updated_at as "updatedAt"`,
        [requesterId, addresseeId]
      );

      logger.info('Friend request sent', {
        requesterId,
        addresseeId,
        friendshipId: result.rows[0].id,
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to send friend request', {
        error: error instanceof Error ? error.message : 'Unknown error',
        requesterId,
        addresseeId,
      });
      throw error;
    }
  }

  /**
   * Accept friend request
   */
  async acceptFriendRequest(friendshipId: string, userId: string): Promise<Friendship> {
    try {
      const friendship = await this.getFriendshipById(friendshipId);
      if (!friendship) {
        throw new Error('Friendship not found');
      }

      // Verify user is the addressee
      if (friendship.addresseeId !== userId) {
        throw new Error('Only the addressee can accept the request');
      }

      // Verify status is pending
      if (friendship.status !== 'pending') {
        throw new Error('Friend request is not pending');
      }

      const result = await database.query<Friendship>(
        `UPDATE friendships
        SET status = 'accepted'
        WHERE id = $1
        RETURNING 
          id, requester_id as "requesterId", addressee_id as "addresseeId",
          status, requested_at as "requestedAt", responded_at as "respondedAt",
          created_at as "createdAt", updated_at as "updatedAt"`,
        [friendshipId]
      );

      logger.info('Friend request accepted', {
        friendshipId,
        userId,
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to accept friend request', {
        error: error instanceof Error ? error.message : 'Unknown error',
        friendshipId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Deny friend request
   */
  async denyFriendRequest(friendshipId: string, userId: string): Promise<Friendship> {
    try {
      const friendship = await this.getFriendshipById(friendshipId);
      if (!friendship) {
        throw new Error('Friendship not found');
      }

      // Verify user is the addressee
      if (friendship.addresseeId !== userId) {
        throw new Error('Only the addressee can deny the request');
      }

      // Verify status is pending
      if (friendship.status !== 'pending') {
        throw new Error('Friend request is not pending');
      }

      const result = await database.query<Friendship>(
        `UPDATE friendships
        SET status = 'denied'
        WHERE id = $1
        RETURNING 
          id, requester_id as "requesterId", addressee_id as "addresseeId",
          status, requested_at as "requestedAt", responded_at as "respondedAt",
          created_at as "createdAt", updated_at as "updatedAt"`,
        [friendshipId]
      );

      logger.info('Friend request denied', {
        friendshipId,
        userId,
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to deny friend request', {
        error: error instanceof Error ? error.message : 'Unknown error',
        friendshipId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Unfriend (delete friendship)
   */
  async unfriend(friendshipId: string, userId: string): Promise<void> {
    try {
      const friendship = await this.getFriendshipById(friendshipId);
      if (!friendship) {
        throw new Error('Friendship not found');
      }

      // Verify user is part of the friendship
      if (friendship.requesterId !== userId && friendship.addresseeId !== userId) {
        throw new Error('You are not part of this friendship');
      }

      await database.query('DELETE FROM friendships WHERE id = $1', [friendshipId]);

      logger.info('Friendship deleted', {
        friendshipId,
        userId,
      });
    } catch (error) {
      logger.error('Failed to unfriend', {
        error: error instanceof Error ? error.message : 'Unknown error',
        friendshipId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Get friendships for a user with filtering
   */
  async getFriendships(
    userId: string,
    status?: 'accepted' | 'pending' | 'denied' | 'blocked',
    limit: number = 50,
    offset: number = 0
  ): Promise<{ friendships: Friendship[]; total: number }> {
    try {
      let whereClause = `(f.requester_id = $1 OR f.addressee_id = $1)`;
      const queryParams: any[] = [userId];
      let paramIndex = 2;

      if (status) {
        whereClause += ` AND f.status = $${paramIndex}`;
        queryParams.push(status);
        paramIndex++;
      }

      // Get total count
      const countResult = await database.query<{ count: string }>(
        `SELECT COUNT(*) as count
        FROM friendships f
        WHERE ${whereClause}`,
        queryParams
      );
      const total = parseInt(countResult.rows[0].count, 10);

      // Get friendships with user details
      queryParams.push(limit, offset);
      const friendshipsResult = await database.query<any>(
        `SELECT 
          f.id, f.requester_id as "requesterId", f.addressee_id as "addresseeId",
          f.status, f.requested_at as "requestedAt", f.responded_at as "respondedAt",
          f.created_at as "createdAt", f.updated_at as "updatedAt",
          -- Requester details
          r.id as "r_id", r.username as "r_username", r.name as "r_name",
          r.profile_picture_url as "r_profilePictureUrl", r.status as "r_status",
          -- Addressee details
          a.id as "a_id", a.username as "a_username", a.name as "a_name",
          a.profile_picture_url as "a_profilePictureUrl", a.status as "a_status"
        FROM friendships f
        JOIN users r ON f.requester_id = r.id
        JOIN users a ON f.addressee_id = a.id
        WHERE ${whereClause}
        ORDER BY f.requested_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        queryParams
      );

      // Transform results to include nested user objects
      const friendships: Friendship[] = friendshipsResult.rows.map((row: any) => ({
        id: row.id,
        requesterId: row.requesterId,
        addresseeId: row.addresseeId,
        status: row.status,
        requestedAt: row.requestedAt,
        respondedAt: row.respondedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        requester: {
          id: row.r_id,
          username: row.r_username,
          name: row.r_name,
          profilePictureUrl: row.r_profilePictureUrl,
          status: row.r_status,
        },
        addressee: {
          id: row.a_id,
          username: row.a_username,
          name: row.a_name,
          profilePictureUrl: row.a_profilePictureUrl,
          status: row.a_status,
        },
      }));

      return { friendships, total };
    } catch (error) {
      logger.error('Failed to get friendships', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        status,
      });
      throw error;
    }
  }

  /**
   * Get pending friend requests (sent and received)
   */
  async getPendingRequests(userId: string): Promise<{
    sent: Friendship[];
    received: Friendship[];
  }> {
    try {
      const result = await this.getFriendships(userId, 'pending', 100, 0);

      const sent = result.friendships.filter((f) => f.requesterId === userId);
      const received = result.friendships.filter((f) => f.addresseeId === userId);

      return { sent, received };
    } catch (error) {
      logger.error('Failed to get pending requests', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      throw error;
    }
  }

  /**
   * Block a user
   */
  async blockUser(blockerId: string, blockedId: string, reason?: string): Promise<Block> {
    try {
      // Check if already blocked
      const existing = await this.isBlocked(blockerId, blockedId);
      if (existing) {
        throw new Error('User is already blocked');
      }

      // Create block record
      const blockResult = await database.query<Block>(
        `INSERT INTO blocks (blocker_id, blocked_id, reason)
        VALUES ($1, $2, $3)
        RETURNING 
          id, blocker_id as "blockerId", blocked_id as "blockedId",
          reason, created_at as "createdAt"`,
        [blockerId, blockedId, reason || null]
      );

      // Update friendship status to 'blocked' if exists
      const friendship = await this.getFriendshipBetween(blockerId, blockedId);
      if (friendship && friendship.status !== 'blocked') {
        await database.query(
          `UPDATE friendships SET status = 'blocked' WHERE id = $1`,
          [friendship.id]
        );
      }

      logger.info('User blocked', {
        blockerId,
        blockedId,
        blockId: blockResult.rows[0].id,
      });

      return blockResult.rows[0];
    } catch (error) {
      logger.error('Failed to block user', {
        error: error instanceof Error ? error.message : 'Unknown error',
        blockerId,
        blockedId,
      });
      throw error;
    }
  }

  /**
   * Unblock a user
   */
  async unblockUser(blockerId: string, blockedId: string): Promise<void> {
    try {
      const result = await database.query(
        'DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2',
        [blockerId, blockedId]
      );

      if (result.rowCount === 0) {
        throw new Error('Block not found');
      }

      // Update friendship status from 'blocked' to 'denied' if exists
      const friendship = await this.getFriendshipBetween(blockerId, blockedId);
      if (friendship && friendship.status === 'blocked') {
        await database.query(
          `UPDATE friendships SET status = 'denied' WHERE id = $1`,
          [friendship.id]
        );
      }

      logger.info('User unblocked', {
        blockerId,
        blockedId,
      });
    } catch (error) {
      logger.error('Failed to unblock user', {
        error: error instanceof Error ? error.message : 'Unknown error',
        blockerId,
        blockedId,
      });
      throw error;
    }
  }

  /**
   * Get block by IDs
   */
  async getBlock(blockerId: string, blockedId: string): Promise<Block | null> {
    try {
      const result = await database.query<Block>(
        `SELECT 
          b.id, b.blocker_id as "blockerId", b.blocked_id as "blockedId",
          b.reason, b.created_at as "createdAt"
        FROM blocks b
        WHERE b.blocker_id = $1 AND b.blocked_id = $2
        LIMIT 1`,
        [blockerId, blockedId]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get block', {
        error: error instanceof Error ? error.message : 'Unknown error',
        blockerId,
        blockedId,
      });
      throw error;
    }
  }
}

// Export singleton instance
const friendshipService = new FriendshipService();
export default friendshipService;
