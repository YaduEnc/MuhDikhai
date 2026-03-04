import database from '../config/database';
import logger from '../utils/logger';

export interface Device {
  id: string;
  userId: string;
  deviceName: string;
  deviceType: 'ios' | 'android' | 'web' | 'desktop';
  deviceToken?: string;
  userAgent?: string;
  ipAddress?: string;
  lastActive: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDeviceData {
  userId: string;
  deviceName: string;
  deviceType: 'ios' | 'android' | 'web' | 'desktop';
  deviceToken?: string;
  userAgent?: string;
  ipAddress?: string;
}

class DeviceService {
  /**
   * Create or get existing device
   */
  async createOrGetDevice(data: CreateDeviceData): Promise<Device> {
    try {
      // Check if device already exists (by user_id, device_name, device_type)
      const existing = await database.query<Device>(
        `SELECT 
          id, user_id as "userId", device_name as "deviceName",
          device_type as "deviceType", device_token as "deviceToken",
          user_agent as "userAgent", ip_address as "ipAddress",
          last_active as "lastActive", is_active as "isActive",
          created_at as "createdAt", updated_at as "updatedAt"
        FROM devices
        WHERE user_id = $1 AND device_name = $2 AND device_type = $3
        LIMIT 1`,
        [data.userId, data.deviceName, data.deviceType]
      );

      if (existing.rows.length > 0) {
        // Update existing device
        const result = await database.query<Device>(
          `UPDATE devices
          SET device_token = $1, user_agent = $2, ip_address = $3,
              last_active = CURRENT_TIMESTAMP, is_active = true
          WHERE id = $4
          RETURNING 
            id, user_id as "userId", device_name as "deviceName",
            device_type as "deviceType", device_token as "deviceToken",
            user_agent as "userAgent", ip_address as "ipAddress",
            last_active as "lastActive", is_active as "isActive",
            created_at as "createdAt", updated_at as "updatedAt"`,
          [data.deviceToken || null, data.userAgent || null, data.ipAddress || null, existing.rows[0].id]
        );

        return result.rows[0];
      }

      // Create new device
      const result = await database.query<Device>(
        `INSERT INTO devices (
          user_id, device_name, device_type, device_token, user_agent, ip_address
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING 
          id, user_id as "userId", device_name as "deviceName",
          device_type as "deviceType", device_token as "deviceToken",
          user_agent as "userAgent", ip_address as "ipAddress",
          last_active as "lastActive", is_active as "isActive",
          created_at as "createdAt", updated_at as "updatedAt"`,
        [
          data.userId,
          data.deviceName,
          data.deviceType,
          data.deviceToken || null,
          data.userAgent || null,
          data.ipAddress || null,
        ]
      );

      logger.info('Device created successfully', {
        deviceId: result.rows[0].id,
        userId: data.userId,
        deviceType: data.deviceType,
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to create or get device', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: data.userId,
      });
      throw error;
    }
  }

  /**
   * Get device by ID
   */
  async getDeviceById(deviceId: string): Promise<Device | null> {
    try {
      const result = await database.query<Device>(
        `SELECT 
          id, user_id as "userId", device_name as "deviceName",
          device_type as "deviceType", device_token as "deviceToken",
          user_agent as "userAgent", ip_address as "ipAddress",
          last_active as "lastActive", is_active as "isActive",
          created_at as "createdAt", updated_at as "updatedAt"
        FROM devices
        WHERE id = $1 AND is_active = true
        LIMIT 1`,
        [deviceId]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get device by ID', {
        error: error instanceof Error ? error.message : 'Unknown error',
        deviceId,
      });
      throw error;
    }
  }

  /**
   * Update device last active
   */
  async updateLastActive(deviceId: string): Promise<void> {
    try {
      await database.query(
        'UPDATE devices SET last_active = CURRENT_TIMESTAMP WHERE id = $1',
        [deviceId]
      );
    } catch (error) {
      logger.error('Failed to update device last active', {
        error: error instanceof Error ? error.message : 'Unknown error',
        deviceId,
      });
    }
  }
}

// Export singleton instance
const deviceService = new DeviceService();
export default deviceService;
