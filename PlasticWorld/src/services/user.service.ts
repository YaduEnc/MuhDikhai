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
  lastSeen: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserData {
  firebaseUid: string;
  email: string;
  name: string;
  profilePictureUrl?: string;
}

export interface UpdateUserData {
  username?: string;
  phoneNumber?: string | null;
  name?: string;
  age?: number;
  profilePictureUrl?: string | null;
  bio?: string | null;
  status?: 'online' | 'offline' | 'away';
}

class UserService {
  /**
   * Generate a unique username from email or name
   * Optimized: Uses database conflict handling instead of multiple queries
   */
  private async generateUniqueUsername(email: string, name: string): Promise<string> {
    // Extract base username from email (before @) or name
    let baseUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // If email-based username is too short or empty, use name
    if (baseUsername.length < 3) {
      baseUsername = name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20);
    }
    
    // Ensure minimum length
    if (baseUsername.length < 3) {
      baseUsername = 'user' + Math.random().toString(36).substring(2, 8);
    }
    
    // Ensure maximum length
    if (baseUsername.length > 27) {
      baseUsername = baseUsername.substring(0, 27);
    }
    
    // Try base username first (most common case)
    if (await this.isUsernameAvailable(baseUsername)) {
      return baseUsername;
    }
    
    // If taken, find next available with single query
    const result = await database.query<{ username: string }>(
      `SELECT username FROM users 
       WHERE username LIKE $1 
       ORDER BY username DESC 
       LIMIT 1`,
      [`${baseUsername}%`]
    );
    
    let counter = 1;
    if (result.rows.length > 0) {
      const lastUsername = result.rows[0].username;
      const match = lastUsername.match(new RegExp(`^${baseUsername}(\\d+)$`));
      if (match) {
        counter = parseInt(match[1], 10) + 1;
      }
    }
    
    // Generate username with counter
    let username = `${baseUsername}${counter}`;
    while (!(await this.isUsernameAvailable(username)) && counter < 1000) {
      counter++;
      username = `${baseUsername}${counter}`;
    }
    
    // Fallback if still not available
    if (counter >= 1000) {
      username = 'user' + Date.now().toString().substring(7);
    }
    
    return username;
  }

  /**
   * Create a new user
   */
  async createUser(data: CreateUserData): Promise<User> {
    try {
      // Generate a unique username
      const username = await this.generateUniqueUsername(data.email, data.name);
      
      // Default age to 18 (user can update later via complete-profile)
      // Database requires age >= 13, so we use 18 as a safe default
      const defaultAge = 18;
      
      const result = await database.query<User>(
        `INSERT INTO users (
          firebase_uid, username, email, name, age, profile_picture_url, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING 
          id, firebase_uid as "firebaseUid", username, email,
          phone_number as "phoneNumber", name, age,
          profile_picture_url as "profilePictureUrl", bio,
          status, last_seen as "lastSeen", is_active as "isActive",
          created_at as "createdAt", updated_at as "updatedAt"`,
        [data.firebaseUid, username, data.email, data.name, defaultAge, data.profilePictureUrl || null, 'offline']
      );

      const user = result.rows[0];

      logger.info('User created successfully', {
        userId: user.id,
        firebaseUid: user.firebaseUid,
        email: user.email,
      });

      return user;
    } catch (error) {
      logger.error('Failed to create user', {
        error: error instanceof Error ? error.message : 'Unknown error',
        firebaseUid: data.firebaseUid,
      });
      throw error;
    }
  }

  /**
   * Get user by Firebase UID OR email (optimized single query)
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
          profile_picture_url as "profilePictureUrl", bio,
          status, last_seen as "lastSeen", is_active as "isActive",
          created_at as "createdAt", updated_at as "updatedAt"
        FROM users
        WHERE ${whereClause}
        ORDER BY 
          CASE WHEN firebase_uid = $1 THEN 1 ELSE 2 END,
          created_at DESC
        LIMIT 1`,
        [firebaseUid, email || '']
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get user by Firebase UID or email', {
        error: error instanceof Error ? error.message : 'Unknown error',
        firebaseUid,
        email,
      });
      throw error;
    }
  }

  /**
   * Get user by Firebase UID (including inactive users)
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
          profile_picture_url as "profilePictureUrl", bio,
          status, last_seen as "lastSeen", is_active as "isActive",
          created_at as "createdAt", updated_at as "updatedAt"
        FROM users
        WHERE ${whereClause}
        LIMIT 1`,
        [firebaseUid]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get user by Firebase UID', {
        error: error instanceof Error ? error.message : 'Unknown error',
        firebaseUid,
      });
      throw error;
    }
  }

  /**
   * Get user by email (including inactive users)
   */
  async getUserByEmail(email: string, includeInactive: boolean = false): Promise<User | null> {
    try {
      const whereClause = includeInactive 
        ? 'email = $1' 
        : 'email = $1 AND is_active = true';
      
      const result = await database.query<User>(
        `SELECT 
          id, firebase_uid as "firebaseUid", username, email,
          phone_number as "phoneNumber", name, age,
          profile_picture_url as "profilePictureUrl", bio,
          status, last_seen as "lastSeen", is_active as "isActive",
          created_at as "createdAt", updated_at as "updatedAt"
        FROM users
        WHERE ${whereClause}
        LIMIT 1`,
        [email]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get user by email', {
        error: error instanceof Error ? error.message : 'Unknown error',
        email,
      });
      throw error;
    }
  }

  /**
   * Reactivate a soft-deleted user
   */
  async reactivateUser(userId: string): Promise<User> {
    try {
      const result = await database.query<User>(
        `UPDATE users 
        SET is_active = true, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING 
          id, firebase_uid as "firebaseUid", username, email,
          phone_number as "phoneNumber", name, age,
          profile_picture_url as "profilePictureUrl", bio,
          status, last_seen as "lastSeen", is_active as "isActive",
          created_at as "createdAt", updated_at as "updatedAt"`,
        [userId]
      );

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      logger.info('User reactivated', { userId });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to reactivate user', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
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
          profile_picture_url as "profilePictureUrl", bio,
          status, last_seen as "lastSeen", is_active as "isActive",
          created_at as "createdAt", updated_at as "updatedAt"
        FROM users
        WHERE id = $1 AND is_active = true
        LIMIT 1`,
        [userId]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get user by ID', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      throw error;
    }
  }

  /**
   * Check if username is available
   */
  async isUsernameAvailable(username: string): Promise<boolean> {
    try {
      const result = await database.query(
        'SELECT 1 FROM users WHERE username = $1 AND is_active = true LIMIT 1',
        [username.toLowerCase()]
      );

      return result.rowCount === 0;
    } catch (error) {
      logger.error('Failed to check username availability', {
        error: error instanceof Error ? error.message : 'Unknown error',
        username,
      });
      throw error;
    }
  }

  /**
   * Check if phone number is available
   */
  async isPhoneAvailable(phoneNumber: string): Promise<boolean> {
    try {
      const result = await database.query(
        'SELECT 1 FROM users WHERE phone_number = $1 AND is_active = true LIMIT 1',
        [phoneNumber]
      );

      return result.rowCount === 0;
    } catch (error) {
      logger.error('Failed to check phone availability', {
        error: error instanceof Error ? error.message : 'Unknown error',
        phoneNumber,
      });
      throw error;
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

      if (data.username !== undefined) {
        updates.push(`username = $${paramIndex}`);
        values.push(data.username.toLowerCase());
        paramIndex++;
      }

      if (data.phoneNumber !== undefined) {
        updates.push(`phone_number = $${paramIndex}`);
        values.push(data.phoneNumber || null);
        paramIndex++;
      }

      if (data.name !== undefined) {
        updates.push(`name = $${paramIndex}`);
        values.push(data.name);
        paramIndex++;
      }

      if (data.age !== undefined) {
        updates.push(`age = $${paramIndex}`);
        values.push(data.age);
        paramIndex++;
      }

      if (data.profilePictureUrl !== undefined) {
        updates.push(`profile_picture_url = $${paramIndex}`);
        values.push(data.profilePictureUrl || null);
        paramIndex++;
      }

      if (data.bio !== undefined) {
        updates.push(`bio = $${paramIndex}`);
        values.push(data.bio || null);
        paramIndex++;
      }

      if (data.status !== undefined) {
        updates.push(`status = $${paramIndex}`);
        values.push(data.status);
        paramIndex++;
      }

      if (updates.length === 0) {
        return (await this.getUserById(userId))!;
      }

      values.push(userId);

      const result = await database.query<User>(
        `UPDATE users 
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex} AND is_active = true
        RETURNING 
          id, firebase_uid as "firebaseUid", username, email,
          phone_number as "phoneNumber", name, age,
          profile_picture_url as "profilePictureUrl", bio,
          status, last_seen as "lastSeen", is_active as "isActive",
          created_at as "createdAt", updated_at as "updatedAt"`,
        values
      );

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to update user', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      throw error;
    }
  }

  /**
   * Update user last seen timestamp
   */
  async updateLastSeen(userId: string): Promise<void> {
    try {
      await database.query(
        'UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = $1',
        [userId]
      );
    } catch (error) {
      logger.error('Failed to update last seen', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
    }
  }

  /**
   * Get public user profile (limited fields, no sensitive data)
   */
  async getPublicUserProfile(userId: string): Promise<Omit<User, 'email' | 'phoneNumber' | 'age' | 'firebaseUid'> | null> {
    try {
      const result = await database.query<Omit<User, 'email' | 'phoneNumber' | 'age' | 'firebaseUid'>>(
        `SELECT 
          id, username, name,
          profile_picture_url as "profilePictureUrl", bio,
          status, last_seen as "lastSeen", is_active as "isActive",
          created_at as "createdAt", updated_at as "updatedAt"
        FROM users
        WHERE id = $1 AND is_active = true
        LIMIT 1`,
        [userId]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get public user profile', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      throw error;
    }
  }

  /**
   * Search users by username, email, or phone number
   */
  async searchUsers(
    searchTerm: string,
    searchType: 'username' | 'email' | 'phone' | 'all' = 'all',
    excludeUserId?: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<{ users: Omit<User, 'email' | 'phoneNumber' | 'age' | 'firebaseUid'>[]; total: number }> {
    try {
      const searchPattern = `%${searchTerm.toLowerCase()}%`;
      let whereClause = 'is_active = true';
      const queryParams: any[] = [];
      let paramIndex = 1;

      // Exclude current user from results
      if (excludeUserId) {
        whereClause += ` AND id != $${paramIndex}`;
        queryParams.push(excludeUserId);
        paramIndex++;
      }

      // Build search condition based on type
      let searchCondition = '';
      if (searchType === 'username') {
        searchCondition = `LOWER(username) LIKE $${paramIndex}`;
        queryParams.push(searchPattern);
        paramIndex++;
      } else if (searchType === 'email') {
        searchCondition = `LOWER(email) LIKE $${paramIndex}`;
        queryParams.push(searchPattern);
        paramIndex++;
      } else if (searchType === 'phone') {
        searchCondition = `phone_number LIKE $${paramIndex}`;
        queryParams.push(searchPattern);
        paramIndex++;
      } else {
        // Search all fields - use different parameter indices for each field
        const param1 = paramIndex;
        const param2 = paramIndex + 1;
        const param3 = paramIndex + 2;
        searchCondition = `(LOWER(username) LIKE $${param1} OR LOWER(email) LIKE $${param2} OR phone_number LIKE $${param3})`;
        queryParams.push(searchPattern, searchPattern, searchPattern);
        paramIndex += 3;
      }

      whereClause += ` AND ${searchCondition}`;

      // Get total count
      const countResult = await database.query<{ count: string }>(
        `SELECT COUNT(*) as count
        FROM users
        WHERE ${whereClause}`,
        queryParams
      );
      const total = parseInt(countResult.rows[0].count, 10);

      // Get users (public profile only)
      const limitParam = paramIndex;
      const offsetParam = paramIndex + 1;
      queryParams.push(limit, offset);
      
      // Find the search pattern parameter index (first search param after excludeUserId)
      const searchParamIndex = excludeUserId ? 2 : 1;
      
      const usersResult = await database.query<Omit<User, 'email' | 'phoneNumber' | 'age' | 'firebaseUid'>>(
        `SELECT 
          id, username, name,
          profile_picture_url as "profilePictureUrl", bio,
          status, last_seen as "lastSeen", is_active as "isActive",
          created_at as "createdAt", updated_at as "updatedAt"
        FROM users
        WHERE ${whereClause}
        ORDER BY 
          CASE 
            WHEN LOWER(username) = LOWER($${searchParamIndex}) THEN 1
            WHEN LOWER(username) LIKE LOWER($${searchParamIndex}) THEN 2
            ELSE 3
          END,
          username ASC
        LIMIT $${limitParam} OFFSET $${offsetParam}`,
        queryParams
      );

      return {
        users: usersResult.rows,
        total,
      };
    } catch (error) {
      logger.error('Failed to search users', {
        error: error instanceof Error ? error.message : 'Unknown error',
        searchTerm,
        searchType,
      });
      throw error;
    }
  }

  /**
   * Update user status
   */
  async updateStatus(userId: string, status: 'online' | 'away' | 'offline'): Promise<User> {
    try {
      const result = await database.query<User>(
        `UPDATE users 
        SET status = $1, last_seen = CURRENT_TIMESTAMP
        WHERE id = $2 AND is_active = true
        RETURNING 
          id, firebase_uid as "firebaseUid", username, email,
          phone_number as "phoneNumber", name, age,
          profile_picture_url as "profilePictureUrl", bio,
          status, last_seen as "lastSeen", is_active as "isActive",
          created_at as "createdAt", updated_at as "updatedAt"`,
        [status, userId]
      );

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      logger.info('User status updated', { userId, status });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to update user status', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        status,
      });
      throw error;
    }
  }

  /**
   * Soft delete user account
   */
  async deleteUser(userId: string): Promise<void> {
    try {
      // Soft delete: set is_active = false
      const result = await database.query(
        'UPDATE users SET is_active = false WHERE id = $1 AND is_active = true',
        [userId]
      );

      if (result.rowCount === 0) {
        throw new Error('User not found or already deleted');
      }

      logger.info('User account deleted', { userId });
    } catch (error) {
      logger.error('Failed to delete user', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      throw error;
    }
  }
}

// Export singleton instance
const userService = new UserService();
export default userService;
