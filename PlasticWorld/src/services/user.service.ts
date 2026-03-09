import database from '../config/database';
import logger from '../utils/logger';

export interface User {
  id: string;
  firebaseUid: string;
  username?: string;
  email: string;
  phoneNumber?: string;
  name: string;
  age?: number;
  profilePictureUrl?: string;
  bio?: string;
  status: 'online' | 'offline' | 'away';
  gender?: 'male' | 'female' | 'non-binary' | 'other' | 'prefer_not_to_say';
  lastSeen: Date;
  roomsEntered: number;
  isAdmin: boolean;
  isActive: boolean;
  auraPoints: number;
  createdAt: Date;
  updatedAt: Date;
}

export const AURA_LEVELS = [
  { level: 1, name: 'Dissolved Mist', minPoints: 0, color: '#94a3b8' },      // Grey/Muted
  { level: 2, name: 'Fading Whisper', minPoints: 50, color: '#f87171' },    // Soft Red
  { level: 3, name: 'Soft Glow', minPoints: 100, color: '#fbbf24' },        // Amber
  { level: 4, name: 'Steady Lantern', minPoints: 250, color: '#22c55e' },   // Green
  { level: 5, name: 'Lighthouse', minPoints: 500, color: '#8b5cf6' },       // Purple/Premium
];

export interface CreateUserData {
  firebaseUid: string;
  email: string;
  name: string;
  profilePictureUrl?: string;
  gender?: 'male' | 'female' | 'non-binary' | 'other' | 'prefer_not_to_say';
  roomsEntered?: number;
  isAdmin?: boolean;
}

export interface UpdateUserData {
  username?: string;
  phoneNumber?: string | null;
  name?: string;
  age?: number;
  profilePictureUrl?: string | null;
  bio?: string | null;
  status?: 'online' | 'offline' | 'away';
  gender?: 'male' | 'female' | 'non-binary' | 'other' | 'prefer_not_to_say';
  roomsEntered?: number;
}

class UserService {
  /**
   * Check if username is already taken
   */
  async isUsernameAvailable(username: string): Promise<boolean> {
    const result = await database.query('SELECT id FROM users WHERE username = $1', [username]);
    return result.rows.length === 0;
  }

  /**
   * Generate a unique username from email or name
   */
  private async generateUniqueUsername(email: string, name: string): Promise<string> {
    let baseUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    if (baseUsername.length < 3) {
      baseUsername = name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20);
    }
    if (baseUsername.length < 3) {
      baseUsername = 'user' + Math.random().toString(36).substring(2, 8);
    }
    if (baseUsername.length > 27) {
      baseUsername = baseUsername.substring(0, 27);
    }

    if (await this.isUsernameAvailable(baseUsername)) {
      return baseUsername;
    }

    // If taken, find next available
    const result = await database.query<{ username: string }>(
      'SELECT username FROM users WHERE username LIKE $1 ORDER BY username DESC LIMIT 1',
      [`${baseUsername}%`]
    );

    let counter = 1;
    if (result.rows.length > 0) {
      const lastUsername = result.rows[0].username;
      const match = lastUsername.match(/(\d+)$/);
      if (match) {
        counter = parseInt(match[1], 10) + 1;
      }
    }

    let username = `${baseUsername}${counter}`;
    while (!(await this.isUsernameAvailable(username))) {
      counter++;
      username = `${baseUsername}${counter}`;
    }

    return username;
  }

  /**
   * Check if phone number is already registered
   */
  async isPhoneAvailable(phoneNumber: string | null): Promise<boolean> {
    if (!phoneNumber) return true;
    const result = await database.query('SELECT id FROM users WHERE phone_number = $1', [phoneNumber]);
    return result.rows.length === 0;
  }

  /**
   * Create a new user
   */
  async createUser(data: CreateUserData): Promise<User> {
    try {
      const username = await this.generateUniqueUsername(data.email, data.name);
      const defaultAge = 18;

      const result = await database.query<User>(
        `INSERT INTO users (
          firebase_uid, username, email, name, age, profile_picture_url, gender, status, rooms_entered, is_admin
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING 
          id, firebase_uid as "firebaseUid", username, email,
          phone_number as "phoneNumber", name, age,
          profile_picture_url as "profilePictureUrl", bio, gender,
          status, last_seen as "lastSeen", is_active as "isActive",
          created_at as "createdAt", updated_at as "updatedAt",
          rooms_entered as "roomsEntered", is_admin as "isAdmin",
          aura_points as "auraPoints"`,
        [data.firebaseUid, username, data.email, data.name, defaultAge, data.profilePictureUrl || null, data.gender || 'prefer_not_to_say', 'offline', data.roomsEntered || 0, data.isAdmin || false]
      );

      const user = result.rows[0];
      logger.info('User created successfully', { userId: user.id });
      return user;
    } catch (error) {
      logger.error('Failed to create user', { error, firebaseUid: data.firebaseUid });
      throw error;
    }
  }

  /**
   * Get user by Firebase UID OR email
   */
  async getUserByFirebaseUidOrEmail(firebaseUid: string, email: string | undefined, includeInactive: boolean = false): Promise<User | null> {
    try {
      const whereClause = includeInactive
        ? '(firebase_uid = $1 OR email = $2)'
        : '(firebase_uid = $1 OR email = $2) AND is_active = true';

      const result = await database.query<User>(
        `SELECT 
          id, firebase_uid as "firebaseUid", username, email,
          phone_number as "phoneNumber", name, age,
          profile_picture_url as "profilePictureUrl", bio, gender,
          status, last_seen as "lastSeen", is_active as "isActive",
          created_at as "createdAt", updated_at as "updatedAt", is_admin as "isAdmin",
          aura_points as "auraPoints"
        FROM users
        WHERE ${whereClause}
        LIMIT 1`,
        [firebaseUid, email || '']
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get user by Firebase UID or email', { error, firebaseUid });
      throw error;
    }
  }

  /**
   * Get user by Firebase UID
   */
  async getUserByFirebaseUid(firebaseUid: string, includeInactive: boolean = false): Promise<User | null> {
    try {
      const whereClause = includeInactive
        ? 'firebase_uid = $1'
        : 'firebase_uid = $1 AND is_active = true';

      const result = await database.query<User>(
        `SELECT 
          id, firebase_uid as "firebaseUid", username, email,
          phone_number as "phoneNumber", name, age,
          profile_picture_url as "profilePictureUrl", bio, gender,
          status, last_seen as "lastSeen", is_active as "isActive",
          created_at as "createdAt", updated_at as "updatedAt", is_admin as "isAdmin",
          aura_points as "auraPoints"
        FROM users
        WHERE ${whereClause}
        LIMIT 1`,
        [firebaseUid]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get user by Firebase UID', { error, firebaseUid });
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    try {
      const result = await database.query<User>(
        `SELECT 
          id, firebase_uid as "firebaseUid", username, email,
          phone_number as "phoneNumber", name, age,
          profile_picture_url as "profilePictureUrl", bio, gender,
          status, last_seen as "lastSeen", is_active as "isActive",
          created_at as "createdAt", updated_at as "updatedAt", is_admin as "isAdmin",
          aura_points as "auraPoints"
        FROM users
        WHERE id = $1 AND is_active = true
        LIMIT 1`,
        [userId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get user by ID', { error, userId });
      throw error;
    }
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string, includeInactive: boolean = false): Promise<User | null> {
    try {
      const whereClause = includeInactive ? 'email = $1' : 'email = $1 AND is_active = true';
      const result = await database.query<User>(
        `SELECT 
          id, firebase_uid as "firebaseUid", username, email,
          phone_number as "phoneNumber", name, age,
          profile_picture_url as "profilePictureUrl", bio, gender,
          status, last_seen as "lastSeen", is_active as "isActive",
          created_at as "createdAt", updated_at as "updatedAt", is_admin as "isAdmin",
          aura_points as "auraPoints"
        FROM users
        WHERE ${whereClause}
        LIMIT 1`,
        [email]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get user by email', { error, email });
      throw error;
    }
  }

  /**
   * Reactivate user
   */
  async reactivateUser(userId: string): Promise<User> {
    try {
      const result = await database.query<User>(
        `UPDATE users SET is_active = true, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING 
           id, firebase_uid as "firebaseUid", username, email,
           phone_number as "phoneNumber", name, age,
           profile_picture_url as "profilePictureUrl", bio, gender,
           status, last_seen as "lastSeen", is_active as "isActive",
           created_at as "createdAt", updated_at as "updatedAt", is_admin as "isAdmin",
           aura_points as "auraPoints"`,
        [userId]
      );

      if (result.rows.length === 0) throw new Error('User not found');
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to reactivate user', { error, userId });
      throw error;
    }
  }

  /**
   * Increment rooms entered
   */
  async incrementRoomsEntered(userId: string): Promise<void> {
    try {
      await database.query('UPDATE users SET rooms_entered = rooms_entered + 1 WHERE id = $1', [userId]);
    } catch (error) {
      logger.error('Failed to increment rooms_entered', { error, userId });
    }
  }

  /**
   * Update user profile
   */
  async updateUser(userId: string, data: UpdateUserData): Promise<User> {
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      const fields = [
        'username', 'phoneNumber', 'name', 'age', 'profilePictureUrl', 'bio', 'status', 'gender', 'roomsEntered'
      ];

      const fieldToColumn: Record<string, string> = {
        username: 'username',
        phoneNumber: 'phone_number',
        name: 'name',
        age: 'age',
        profilePictureUrl: 'profile_picture_url',
        bio: 'bio',
        status: 'status',
        gender: 'gender',
        roomsEntered: 'rooms_entered'
      };

      for (const field of fields) {
        if (data[field as keyof UpdateUserData] !== undefined) {
          updates.push(`${fieldToColumn[field]} = $${paramIndex}`);
          values.push(data[field as keyof UpdateUserData]);
          paramIndex++;
        }
      }

      if (updates.length === 0) {
        return (await this.getUserById(userId))!;
      }

      values.push(userId);
      const result = await database.query<User>(
        `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${paramIndex} AND is_active = true
         RETURNING 
           id, firebase_uid as "firebaseUid", username, email,
           phone_number as "phoneNumber", name, age,
           profile_picture_url as "profilePictureUrl", bio, gender,
           status, last_seen as "lastSeen", is_active as "isActive",
           created_at as "createdAt", updated_at as "updatedAt", is_admin as "isAdmin",
           aura_points as "auraPoints"`,
        values
      );

      if (result.rows.length === 0) throw new Error('User not found');
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to update user', { error, userId });
      throw error;
    }
  }

  /**
   * Get public user profile
   */
  async getPublicUserProfile(userId: string): Promise<Omit<User, 'email' | 'phoneNumber' | 'firebaseUid'> | null> {
    try {
      const result = await database.query<Omit<User, 'email' | 'phoneNumber' | 'firebaseUid'>>(
        `SELECT id, username, name, age, profile_picture_url as "profilePictureUrl", bio, gender, status, last_seen as "lastSeen", is_active as "isActive", aura_points as "auraPoints"
         FROM users WHERE id = $1 AND is_active = true LIMIT 1`,
        [userId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get public user profile', { error, userId });
      throw error;
    }
  }

  /**
   * Update status
   */
  async updateStatus(userId: string, status: 'online' | 'away' | 'offline'): Promise<User> {
    return this.updateUser(userId, { status });
  }

  /**
   * Update last seen
   */
  async updateLastSeen(userId: string): Promise<void> {
    await database.query('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = $1', [userId]);
  }

  /**
   * Vibe check
   */
  async submitVibeCheck(voterId: string, targetId: string, roomId: string, vibe: 'warm' | 'cold'): Promise<{ auraPoints: number; level: any }> {
    try {
      await database.query(
        `INSERT INTO vibe_check_history (voter_id, target_id, room_id, vibe) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [voterId, targetId, roomId, vibe]
      );
      const pointChange = vibe === 'warm' ? 5 : -10;
      const result = await database.query<{ auraPoints: number }>(
        `UPDATE users SET aura_points = GREATEST(0, aura_points + $1) WHERE id = $2 RETURNING aura_points as "auraPoints"`,
        [pointChange, targetId]
      );
      const auraPoints = result.rows[0]?.auraPoints || 0;
      return { auraPoints, level: this.calculateAuraLevel(auraPoints) };
    } catch (error) {
      logger.error('Vibe check failed', { error, voterId, targetId });
      throw error;
    }
  }

  /**
   * Hard delete user and related data
   */
  async hardDeleteUser(userId: string): Promise<void> {
    try {
      await database.query('DELETE FROM users WHERE id = $1', [userId]);
      logger.info('User hard-deleted', { userId });
    } catch (error) {
      logger.error('Failed to hard delete user', { error, userId });
      throw error;
    }
  }

  /**
   * Search users by username, email or phone
   */
  async searchUsers(q: string, type: string, excludeUserId: string, limit: number, offset: number) {
    try {
      const pattern = `%${q.toLowerCase()}%`;
      let where = 'is_active = true AND id != $1';
      const params: any[] = [excludeUserId];

      if (type === 'username') {
        where += ' AND LOWER(username) LIKE $2';
        params.push(pattern);
      } else if (type === 'email') {
        where += ' AND LOWER(email) LIKE $2';
        params.push(pattern);
      } else if (type === 'phone') {
        where += ' AND phone_number LIKE $2';
        params.push(pattern);
      } else {
        where += ' AND (LOWER(username) LIKE $2 OR LOWER(email) LIKE $3 OR phone_number LIKE $4)';
        params.push(pattern, pattern, pattern);
      }

      const countResult = await database.query(`SELECT COUNT(*) as count FROM users WHERE ${where}`, params);
      const total = parseInt(countResult.rows[0].count);

      const usersResult = await database.query(
        `SELECT id, username, name, profile_picture_url as "profilePictureUrl", bio, status 
         FROM users WHERE ${where} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      );

      return { users: usersResult.rows, total };
    } catch (error) {
      logger.error('User search failed', { error, q });
      throw error;
    }
  }

  calculateAuraLevel(points: number) {
    const reverseLevels = [...AURA_LEVELS].reverse();
    const current = reverseLevels.find((l: any) => points >= l.minPoints) || AURA_LEVELS[0];
    const next = AURA_LEVELS.find((l: any) => l.level === current.level + 1) || null;
    return {
      ...current,
      nextLevel: next ? next.minPoints : null,
      progress: next ? ((points - current.minPoints) / (next.minPoints - current.minPoints)) * 100 : 100
    };
  }
}

export default new UserService();
