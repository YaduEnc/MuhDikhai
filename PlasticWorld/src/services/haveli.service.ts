import database from '../config/database';
import logger from '../utils/logger';

// ─── Types ─────────────────────────────────────────────────────────
export interface Haveli {
  id: string;
  creatorId: string;
  name: string;
  description: string | null;
  themeId: string;
  privacyType: 'public' | 'invite';
  inviteCode: string;
  isLocked: boolean;
  maxMembers: number;
  pinnedMessage: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  memberCount?: number;
  onlineCount?: number;
  creator?: { id: string; name: string; username?: string; profilePictureUrl?: string; auraPoints?: number };
}

export interface HaveliMember {
  id: string;
  haveliId: string;
  userId: string;
  role: 'admin' | 'member';
  joinedAt: Date;
  user?: {
    id: string;
    name: string;
    username?: string;
    profilePictureUrl?: string;
    auraPoints?: number;
    status?: string;
  };
}

export interface HaveliMessage {
  id: string;
  haveliId: string;
  senderId: string;
  content: string;
  messageType: string;
  isSystem: boolean;
  createdAt: Date;
  sender?: {
    id: string;
    name: string;
    username?: string;
    profilePictureUrl?: string;
    auraPoints?: number;
  };
}

export interface CreateHaveliData {
  creatorId: string;
  name: string;
  description?: string;
  themeId?: string;
  privacyType?: 'public' | 'invite';
  maxMembers?: number;
}

export const HAVELI_THEMES = [
  { id: 'midnight_terrace', name: 'Midnight Terrace', color: '#0f0c29', accent: '#8b5cf6' },
  { id: 'monsoon_night', name: 'Monsoon Night', color: '#0a192f', accent: '#38bdf8' },
  { id: 'cyber_dhaba', name: 'Cyber Dhaba', color: '#1a0a2e', accent: '#f472b6' },
  { id: 'ancient_library', name: 'Ancient Library', color: '#1c1410', accent: '#d97706' },
  { id: 'neon_bazaar', name: 'Neon Bazaar', color: '#0d0d0d', accent: '#22c55e' },
  { id: 'sunset_courtyard', name: 'Sunset Courtyard', color: '#1a0f0a', accent: '#fb923c' },
  { id: 'ocean_deck', name: 'Ocean Deck', color: '#0a1628', accent: '#06b6d4' },
  { id: 'royal_durbar', name: 'Royal Durbar', color: '#1a0a1e', accent: '#e879f9' },
];

// ─── Helpers ───────────────────────────────────────────────────────
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ─── Service ───────────────────────────────────────────────────────
class HaveliService {
  /**
   * Create a new Haveli
   */
  async createHaveli(data: CreateHaveliData): Promise<Haveli> {
    try {
      let inviteCode = generateInviteCode();
      // Ensure uniqueness (very unlikely to clash but safety first)
      let attempts = 0;
      while (attempts < 5) {
        const existing = await database.query('SELECT 1 FROM havelis WHERE invite_code = $1', [inviteCode]);
        if (existing.rows.length === 0) break;
        inviteCode = generateInviteCode();
        attempts++;
      }

      const result = await database.query<Haveli>(
        `INSERT INTO havelis (creator_id, name, description, theme_id, privacy_type, invite_code, max_members)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING
           id, creator_id as "creatorId", name, description, theme_id as "themeId",
           privacy_type as "privacyType", invite_code as "inviteCode",
           is_locked as "isLocked", max_members as "maxMembers",
           pinned_message as "pinnedMessage", is_active as "isActive",
           created_at as "createdAt", updated_at as "updatedAt"`,
        [
          data.creatorId,
          data.name.trim(),
          data.description?.trim() || null,
          data.themeId || 'midnight_terrace',
          data.privacyType || 'public',
          inviteCode,
          data.maxMembers || 50,
        ]
      );

      const haveli = result.rows[0];

      // Update user's creation timestamp (requires an alter in DB for robustness or just trust 5 limit)
      // For now, let's stick to the 5 limit + 10 minute check here via query

      // Auto-add creator as admin member
      await database.query(
        `INSERT INTO haveli_members (haveli_id, user_id, role) VALUES ($1, $2, 'admin')`,
        [haveli.id, data.creatorId]
      );

      // Add system message
      await this.addSystemMessage(haveli.id, 'Haveli created. Welcome! 🏛️');

      logger.info('Haveli created', { haveliId: haveli.id, creator: data.creatorId });
      return haveli;
    } catch (error) {
      logger.error('Failed to create Haveli', { error, data });
      throw error;
    }
  }

  /**
   * Get a Haveli by ID
   */
  async getHaveliById(haveliId: string): Promise<Haveli | null> {
    try {
      const result = await database.query<Haveli>(
        `SELECT h.id, h.creator_id as "creatorId", h.name, h.description,
                h.theme_id as "themeId", h.privacy_type as "privacyType",
                h.invite_code as "inviteCode", h.is_locked as "isLocked",
                h.max_members as "maxMembers", h.pinned_message as "pinnedMessage",
                h.is_active as "isActive", h.created_at as "createdAt",
                h.updated_at as "updatedAt",
                (SELECT COUNT(*) FROM haveli_members WHERE haveli_id = h.id)::int as "memberCount",
                json_build_object(
                  'id', u.id, 'name', u.name, 'username', u.username,
                  'profilePictureUrl', u.profile_picture_url, 'auraPoints', u.aura_points
                ) as creator
         FROM havelis h
         JOIN users u ON u.id = h.creator_id
         WHERE h.id = $1 AND h.is_active = true`,
        [haveliId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get Haveli', { error, haveliId });
      throw error;
    }
  }

  /**
   * Get a Haveli by invite code
   */
  async getHaveliByInviteCode(inviteCode: string): Promise<Haveli | null> {
    try {
      const result = await database.query<Haveli>(
        `SELECT h.id, h.creator_id as "creatorId", h.name, h.description,
                h.theme_id as "themeId", h.privacy_type as "privacyType",
                h.invite_code as "inviteCode", h.is_locked as "isLocked",
                h.max_members as "maxMembers", h.pinned_message as "pinnedMessage",
                h.is_active as "isActive", h.created_at as "createdAt",
                h.updated_at as "updatedAt",
                (SELECT COUNT(*) FROM haveli_members WHERE haveli_id = h.id)::int as "memberCount",
                json_build_object(
                  'id', u.id, 'name', u.name, 'username', u.username,
                  'profilePictureUrl', u.profile_picture_url, 'auraPoints', u.aura_points
                ) as creator
         FROM havelis h
         JOIN users u ON u.id = h.creator_id
         WHERE UPPER(h.invite_code) = UPPER($1) AND h.is_active = true`,
        [inviteCode]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get Haveli by invite code', { error, inviteCode });
      throw error;
    }
  }

  /**
   * List public Havelis (The Bazaar)
   */
  async listPublicHavelis(limit = 20, offset = 0): Promise<{ havelis: Haveli[]; total: number }> {
    try {
      const countResult = await database.query(
        `SELECT COUNT(*) as count FROM havelis WHERE privacy_type = 'public' AND is_active = true`
      );
      const total = parseInt(countResult.rows[0].count);

      const result = await database.query<Haveli>(
        `SELECT h.id, h.creator_id as "creatorId", h.name, h.description,
                h.theme_id as "themeId", h.privacy_type as "privacyType",
                h.invite_code as "inviteCode", h.is_locked as "isLocked",
                h.max_members as "maxMembers", h.pinned_message as "pinnedMessage",
                h.is_active as "isActive", h.created_at as "createdAt",
                h.updated_at as "updatedAt",
                (SELECT COUNT(*) FROM haveli_members WHERE haveli_id = h.id)::int as "memberCount",
                json_build_object(
                  'id', u.id, 'name', u.name, 'username', u.username,
                  'profilePictureUrl', u.profile_picture_url, 'auraPoints', u.aura_points
                ) as creator
         FROM havelis h
         JOIN users u ON u.id = h.creator_id
         WHERE h.privacy_type = 'public' AND h.is_active = true
         ORDER BY h.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      return { havelis: result.rows, total };
    } catch (error) {
      logger.error('Failed to list public Havelis', { error });
      throw error;
    }
  }

  /**
   * List Havelis a user is a member of
   */
  async listMyHavelis(userId: string): Promise<Haveli[]> {
    try {
      const result = await database.query<Haveli>(
        `SELECT h.id, h.creator_id as "creatorId", h.name, h.description,
                h.theme_id as "themeId", h.privacy_type as "privacyType",
                h.invite_code as "inviteCode", h.is_locked as "isLocked",
                h.max_members as "maxMembers", h.pinned_message as "pinnedMessage",
                h.is_active as "isActive", h.created_at as "createdAt",
                h.updated_at as "updatedAt",
                hm.role as "myRole",
                (SELECT COUNT(*) FROM haveli_members WHERE haveli_id = h.id)::int as "memberCount",
                json_build_object(
                  'id', u.id, 'name', u.name, 'username', u.username,
                  'profilePictureUrl', u.profile_picture_url, 'auraPoints', u.aura_points
                ) as creator
         FROM havelis h
         JOIN haveli_members hm ON hm.haveli_id = h.id AND hm.user_id = $1
         JOIN users u ON u.id = h.creator_id
         WHERE h.is_active = true
         ORDER BY hm.joined_at DESC`,
        [userId]
      );
      return result.rows;
    } catch (error) {
      logger.error('Failed to list user Havelis', { error, userId });
      throw error;
    }
  }

  /**
   * Join a Haveli
   */
  async joinHaveli(haveliId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const haveli = await this.getHaveliById(haveliId);
      if (!haveli) return { success: false, error: 'Haveli not found' };
      if (!haveli.isActive) return { success: false, error: 'This Haveli has been closed' };
      if (haveli.isLocked) return { success: false, error: 'This Haveli is currently locked' };

      // Check if banned
      const banCheck = await database.query(
        `SELECT 1 FROM haveli_bans WHERE haveli_id = $1 AND user_id = $2`,
        [haveliId, userId]
      );
      if (banCheck.rows.length > 0) return { success: false, error: 'You are banned from this Haveli' };

      // Check if already a member
      const existing = await database.query(
        `SELECT 1 FROM haveli_members WHERE haveli_id = $1 AND user_id = $2`,
        [haveliId, userId]
      );
      if (existing.rows.length > 0) return { success: true }; // Already member

      // Check member cap
      const countResult = await database.query(
        `SELECT COUNT(*) as count FROM haveli_members WHERE haveli_id = $1`,
        [haveliId]
      );
      if (parseInt(countResult.rows[0].count) >= haveli.maxMembers) {
        return { success: false, error: 'This Haveli is full' };
      }

      await database.query(
        `INSERT INTO haveli_members (haveli_id, user_id, role) VALUES ($1, $2, 'member')
         ON CONFLICT (haveli_id, user_id) DO NOTHING`,
        [haveliId, userId]
      );

      logger.info('User joined Haveli', { haveliId, userId });
      return { success: true };
    } catch (error) {
      logger.error('Failed to join Haveli', { error, haveliId, userId });
      throw error;
    }
  }

  /**
   * Leave a Haveli
   */
  async leaveHaveli(haveliId: string, userId: string): Promise<{ success: boolean; deleted?: boolean }> {
    try {
      const haveli = await this.getHaveliById(haveliId);
      if (!haveli) return { success: false };

      // If the creator leaves, delete the Haveli
      if (haveli.creatorId === userId) {
        await this.deleteHaveli(haveliId, userId);
        return { success: true, deleted: true };
      }

      await database.query(
        `DELETE FROM haveli_members WHERE haveli_id = $1 AND user_id = $2`,
        [haveliId, userId]
      );

      logger.info('User left Haveli', { haveliId, userId });
      return { success: true };
    } catch (error) {
      logger.error('Failed to leave Haveli', { error, haveliId, userId });
      throw error;
    }
  }

  /**
   * Kick a member from the Haveli (admin only)
   */
  async kickMember(haveliId: string, adminId: string, targetId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Verify admin role
      const adminCheck = await database.query(
        `SELECT role FROM haveli_members WHERE haveli_id = $1 AND user_id = $2`,
        [haveliId, adminId]
      );
      if (!adminCheck.rows[0] || adminCheck.rows[0].role !== 'admin') {
        return { success: false, error: 'Only the admin can kick members' };
      }

      // Cannot kick yourself
      if (adminId === targetId) {
        return { success: false, error: 'Cannot kick yourself' };
      }

      // Add to bans table
      await database.query(
        `INSERT INTO haveli_bans (haveli_id, user_id, banned_by) VALUES ($1, $2, $3)
         ON CONFLICT (haveli_id, user_id) DO NOTHING`,
        [haveliId, targetId, adminId]
      );

      await database.query(
        `DELETE FROM haveli_members WHERE haveli_id = $1 AND user_id = $2`,
        [haveliId, targetId]
      );

      logger.info('Member banned/kicked from Haveli', { haveliId, adminId, targetId });
      return { success: true };
    } catch (error) {
      logger.error('Failed to kick member', { error, haveliId, adminId, targetId });
      throw error;
    }
  }

  /**
   * Update Haveli settings (admin only)
   */
  async updateHaveli(
    haveliId: string,
    adminId: string,
    updates: { name?: string; description?: string; themeId?: string; privacyType?: 'public' | 'invite'; isLocked?: boolean; pinnedMessage?: string | null }
  ): Promise<{ success: boolean; haveli?: Haveli; error?: string }> {
    try {
      // Verify admin
      const adminCheck = await database.query(
        `SELECT role FROM haveli_members WHERE haveli_id = $1 AND user_id = $2`,
        [haveliId, adminId]
      );
      if (!adminCheck.rows[0] || adminCheck.rows[0].role !== 'admin') {
        return { success: false, error: 'Only the admin can update settings' };
      }

      const setClauses: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (updates.name !== undefined) { setClauses.push(`name = $${idx++}`); values.push(updates.name.trim()); }
      if (updates.description !== undefined) { setClauses.push(`description = $${idx++}`); values.push(updates.description?.trim() || null); }
      if (updates.themeId !== undefined) { setClauses.push(`theme_id = $${idx++}`); values.push(updates.themeId); }
      if (updates.privacyType !== undefined) { setClauses.push(`privacy_type = $${idx++}`); values.push(updates.privacyType); }
      if (updates.isLocked !== undefined) { setClauses.push(`is_locked = $${idx++}`); values.push(updates.isLocked); }
      if (updates.pinnedMessage !== undefined) { setClauses.push(`pinned_message = $${idx++}`); values.push(updates.pinnedMessage); }

      if (setClauses.length === 0) {
        const current = await this.getHaveliById(haveliId);
        return { success: true, haveli: current || undefined };
      }

      values.push(haveliId);
      const result = await database.query<Haveli>(
        `UPDATE havelis SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${idx} AND is_active = true
         RETURNING
           id, creator_id as "creatorId", name, description, theme_id as "themeId",
           privacy_type as "privacyType", invite_code as "inviteCode",
           is_locked as "isLocked", max_members as "maxMembers",
           pinned_message as "pinnedMessage", is_active as "isActive",
           created_at as "createdAt", updated_at as "updatedAt"`,
        values
      );

      if (result.rows.length === 0) return { success: false, error: 'Haveli not found' };

      logger.info('Haveli updated', { haveliId, adminId, updates });
      return { success: true, haveli: result.rows[0] };
    } catch (error) {
      logger.error('Failed to update Haveli', { error, haveliId, adminId });
      throw error;
    }
  }

  /**
   * Delete a Haveli (admin/creator only)
   */
  async deleteHaveli(haveliId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const haveli = await this.getHaveliById(haveliId);
      if (!haveli) return { success: false, error: 'Haveli not found' };
      if (haveli.creatorId !== userId) {
        return { success: false, error: 'Only the creator can delete a Haveli' };
      }

      // Soft delete — mark inactive and wipe messages
      await database.query(`DELETE FROM haveli_messages WHERE haveli_id = $1`, [haveliId]);
      await database.query(`DELETE FROM haveli_members WHERE haveli_id = $1`, [haveliId]);
      await database.query(`UPDATE havelis SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [haveliId]);

      logger.info('Haveli deleted', { haveliId, userId });
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete Haveli', { error, haveliId, userId });
      throw error;
    }
  }

  /**
   * Get members of a Haveli
   */
  async getMembers(haveliId: string): Promise<HaveliMember[]> {
    try {
      const result = await database.query<HaveliMember>(
        `SELECT hm.id, hm.haveli_id as "haveliId", hm.user_id as "userId",
                hm.role, hm.joined_at as "joinedAt",
                json_build_object(
                  'id', u.id, 'name', u.name, 'username', u.username,
                  'profilePictureUrl', u.profile_picture_url, 'auraPoints', u.aura_points,
                  'status', u.status
                ) as user
         FROM haveli_members hm
         JOIN users u ON u.id = hm.user_id
         WHERE hm.haveli_id = $1
         ORDER BY hm.role ASC, hm.joined_at ASC`,
        [haveliId]
      );
      return result.rows;
    } catch (error) {
      logger.error('Failed to get Haveli members', { error, haveliId });
      throw error;
    }
  }

  /**
   * Check if a user is a member
   */
  async isMember(haveliId: string, userId: string): Promise<{ isMember: boolean; role?: string }> {
    try {
      const result = await database.query(
        `SELECT role FROM haveli_members WHERE haveli_id = $1 AND user_id = $2`,
        [haveliId, userId]
      );
      if (result.rows.length === 0) return { isMember: false };
      return { isMember: true, role: result.rows[0].role };
    } catch (error) {
      logger.error('Failed to check membership', { error, haveliId, userId });
      return { isMember: false };
    }
  }

  /**
   * Get recent messages (for loading on room entry)
   */
  async getRecentMessages(haveliId: string, limit = 50, before?: string): Promise<HaveliMessage[]> {
    try {
      let query = `
        SELECT hm.id, hm.haveli_id as "haveliId", hm.sender_id as "senderId",
               hm.content, hm.message_type as "messageType",
               hm.is_system as "isSystem", hm.created_at as "createdAt",
               json_build_object(
                 'id', u.id, 'name', u.name, 'username', u.username,
                 'profilePictureUrl', u.profile_picture_url, 'auraPoints', u.aura_points
               ) as sender
        FROM haveli_messages hm
        JOIN users u ON u.id = hm.sender_id
        WHERE hm.haveli_id = $1
      `;
      const params: any[] = [haveliId];

      if (before) {
        query += ` AND hm.created_at < $2`;
        params.push(before);
      }

      query += ` ORDER BY hm.created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await database.query<HaveliMessage>(query, params);
      return result.rows.reverse(); // Return in chronological order
    } catch (error) {
      logger.error('Failed to get Haveli messages', { error, haveliId });
      throw error;
    }
  }

  /**
   * Store a message
   */
  async storeMessage(haveliId: string, senderId: string, content: string, messageType = 'text'): Promise<HaveliMessage> {
    try {
      const result = await database.query<HaveliMessage>(
        `INSERT INTO haveli_messages (haveli_id, sender_id, content, message_type)
         VALUES ($1, $2, $3, $4)
         RETURNING
           id, haveli_id as "haveliId", sender_id as "senderId",
           content, message_type as "messageType",
           is_system as "isSystem", created_at as "createdAt"`,
        [haveliId, senderId, content, messageType]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to store Haveli message', { error, haveliId, senderId });
      throw error;
    }
  }

  /**
   * Store a system message
   */
  async addSystemMessage(haveliId: string, content: string): Promise<void> {
    try {
      // Use creator as sender for system messages
      const haveli = await database.query('SELECT creator_id FROM havelis WHERE id = $1', [haveliId]);
      if (haveli.rows.length === 0) return;

      await database.query(
        `INSERT INTO haveli_messages (haveli_id, sender_id, content, message_type, is_system)
         VALUES ($1, $2, $3, 'system', true)`,
        [haveliId, haveli.rows[0].creator_id, content]
      );
    } catch (error) {
      logger.error('Failed to add system message', { error, haveliId });
    }
  }

  /**
   * Report a Haveli for inappropriate content
   */
  async reportHaveli(haveliId: string, reporterId: string, reason: string, details?: string): Promise<void> {
    try {
      await database.query(
        `INSERT INTO reports (reporter_id, reported_haveli_id, reason, details)
         VALUES ($1, $2, $3, $4)`,
        [reporterId, haveliId, reason, details || null]
      );
      logger.info('Haveli reported', { haveliId, reporterId, reason });
    } catch (error) {
      logger.error('Failed to report Haveli', { error, haveliId, reporterId });
      throw error;
    }
  }
}

export default new HaveliService();
