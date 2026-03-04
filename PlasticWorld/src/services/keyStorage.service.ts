import database from '../config/database';
import logger from '../utils/logger';
import encryptionService, { KeyPair, PreKeyBundle } from './encryption.service';

export interface EncryptionKeys {
  id: string;
  userId: string;
  deviceId: string;
  identityKeyPublic: Buffer;
  signedPrekeyPublic: Buffer;
  signedPrekeySignature: Buffer;
  oneTimePrekeys: Array<{ keyId: number; publicKey: string }>;
  prekeyCount: number;
  keyCreatedAt: Date;
  keyExpiresAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateKeysData {
  userId: string;
  deviceId: string;
  identityKeyPair: KeyPair;
  signedPreKeyPair: KeyPair;
  signedPreKeySignature: Uint8Array;
  oneTimePreKeys: Array<{ keyId: number; keyPair: KeyPair }>;
}

class KeyStorageService {
  /**
   * Create or update encryption keys for a device
   */
  async createOrUpdateKeys(data: CreateKeysData): Promise<EncryptionKeys> {
    try {
      // Convert keys to buffers for storage
      const identityKeyPublic = Buffer.from(data.identityKeyPair.publicKey);
      const signedPrekeyPublic = Buffer.from(data.signedPreKeyPair.publicKey);
      const signedPrekeySignature = Buffer.from(data.signedPreKeySignature);
      
      // Convert one-time prekeys to JSON
      const oneTimePrekeys = data.oneTimePreKeys.map((prekey) => ({
        keyId: prekey.keyId,
        publicKey: encryptionService.toBase64(prekey.keyPair.publicKey),
      }));

      // Check if keys already exist
      const existing = await this.getKeysByDevice(data.userId, data.deviceId);
      
      if (existing) {
        // Update existing keys
        const result = await database.query<EncryptionKeys>(
          `UPDATE encryption_keys
          SET 
            identity_key_public = $1,
            signed_prekey_public = $2,
            signed_prekey_signature = $3,
            one_time_prekeys = $4::jsonb,
            prekey_count = $5,
            key_created_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP,
            is_active = true
          WHERE user_id = $6 AND device_id = $7
          RETURNING 
            id, user_id as "userId", device_id as "deviceId",
            identity_key_public as "identityKeyPublic",
            signed_prekey_public as "signedPrekeyPublic",
            signed_prekey_signature as "signedPrekeySignature",
            one_time_prekeys as "oneTimePrekeys",
            prekey_count as "prekeyCount",
            key_created_at as "keyCreatedAt",
            key_expires_at as "keyExpiresAt",
            is_active as "isActive",
            created_at as "createdAt",
            updated_at as "updatedAt"`,
          [
            identityKeyPublic,
            signedPrekeyPublic,
            signedPrekeySignature,
            JSON.stringify(oneTimePrekeys),
            oneTimePrekeys.length,
            data.userId,
            data.deviceId,
          ]
        );

        logger.info('Encryption keys updated', {
          userId: data.userId,
          deviceId: data.deviceId,
          prekeyCount: oneTimePrekeys.length,
        });

        return result.rows[0];
      } else {
        // Create new keys
        const result = await database.query<EncryptionKeys>(
          `INSERT INTO encryption_keys (
            user_id, device_id, identity_key_public,
            signed_prekey_public, signed_prekey_signature,
            one_time_prekeys, prekey_count
          ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
          RETURNING 
            id, user_id as "userId", device_id as "deviceId",
            identity_key_public as "identityKeyPublic",
            signed_prekey_public as "signedPrekeyPublic",
            signed_prekey_signature as "signedPrekeySignature",
            one_time_prekeys as "oneTimePrekeys",
            prekey_count as "prekeyCount",
            key_created_at as "keyCreatedAt",
            key_expires_at as "keyExpiresAt",
            is_active as "isActive",
            created_at as "createdAt",
            updated_at as "updatedAt"`,
          [
            data.userId,
            data.deviceId,
            identityKeyPublic,
            signedPrekeyPublic,
            signedPrekeySignature,
            JSON.stringify(oneTimePrekeys),
            oneTimePrekeys.length,
          ]
        );

        logger.info('Encryption keys created', {
          userId: data.userId,
          deviceId: data.deviceId,
          prekeyCount: oneTimePrekeys.length,
        });

        return result.rows[0];
      }
    } catch (error) {
      logger.error('Failed to create or update encryption keys', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: data.userId,
        deviceId: data.deviceId,
      });
      throw error;
    }
  }

  /**
   * Get encryption keys by user and device
   */
  async getKeysByDevice(userId: string, deviceId: string): Promise<EncryptionKeys | null> {
    try {
      const result = await database.query<EncryptionKeys>(
        `SELECT 
          id, user_id as "userId", device_id as "deviceId",
          identity_key_public as "identityKeyPublic",
          signed_prekey_public as "signedPrekeyPublic",
          signed_prekey_signature as "signedPrekeySignature",
          one_time_prekeys as "oneTimePrekeys",
          prekey_count as "prekeyCount",
          key_created_at as "keyCreatedAt",
          key_expires_at as "keyExpiresAt",
          is_active as "isActive",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM encryption_keys
        WHERE user_id = $1 AND device_id = $2 AND is_active = true
        LIMIT 1`,
        [userId, deviceId]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get encryption keys by device', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        deviceId,
      });
      throw error;
    }
  }

  /**
   * Get prekey bundle for a user (for X3DH)
   * Returns identity key, signed prekey, and one one-time prekey
   */
  async getPreKeyBundle(userId: string, deviceId: string): Promise<PreKeyBundle | null> {
    try {
      const keys = await this.getKeysByDevice(userId, deviceId);
      
      if (!keys || keys.prekeyCount === 0) {
        return null;
      }

      // Get first available one-time prekey
      const oneTimePrekeys = keys.oneTimePrekeys as Array<{ keyId: number; publicKey: string }>;
      const oneTimePrekey = oneTimePrekeys[0];

      if (!oneTimePrekey) {
        return null;
      }

      return {
        identityKey: Buffer.from(keys.identityKeyPublic),
        signedPreKey: {
          keyId: Date.now(), // Use timestamp as key ID
          publicKey: Buffer.from(keys.signedPrekeyPublic),
          signature: Buffer.from(keys.signedPrekeySignature),
        },
        oneTimePreKey: {
          keyId: oneTimePrekey.keyId,
          publicKey: encryptionService.fromBase64(oneTimePrekey.publicKey),
        },
      };
    } catch (error) {
      logger.error('Failed to get prekey bundle', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        deviceId,
      });
      throw error;
    }
  }

  /**
   * Consume a one-time prekey (remove it after use)
   */
  async consumeOneTimePreKey(userId: string, deviceId: string, keyId: number): Promise<boolean> {
    try {
      const keys = await this.getKeysByDevice(userId, deviceId);
      
      if (!keys) {
        return false;
      }

      const oneTimePrekeys = keys.oneTimePrekeys as Array<{ keyId: number; publicKey: string }>;
      const filteredPrekeys = oneTimePrekeys.filter((prekey) => prekey.keyId !== keyId);

      // Update keys with consumed prekey removed
      await database.query(
        `UPDATE encryption_keys
        SET 
          one_time_prekeys = $1::jsonb,
          prekey_count = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $3 AND device_id = $4`,
        [JSON.stringify(filteredPrekeys), filteredPrekeys.length, userId, deviceId]
      );

      logger.info('One-time prekey consumed', {
        userId,
        deviceId,
        keyId,
        remainingCount: filteredPrekeys.length,
      });

      return true;
    } catch (error) {
      logger.error('Failed to consume one-time prekey', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        deviceId,
        keyId,
      });
      throw error;
    }
  }

  /**
   * Get all active keys for a user (all devices)
   */
  async getUserKeys(userId: string): Promise<EncryptionKeys[]> {
    try {
      const result = await database.query<EncryptionKeys>(
        `SELECT 
          id, user_id as "userId", device_id as "deviceId",
          identity_key_public as "identityKeyPublic",
          signed_prekey_public as "signedPrekeyPublic",
          signed_prekey_signature as "signedPrekeySignature",
          one_time_prekeys as "oneTimePrekeys",
          prekey_count as "prekeyCount",
          key_created_at as "keyCreatedAt",
          key_expires_at as "keyExpiresAt",
          is_active as "isActive",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM encryption_keys
        WHERE user_id = $1 AND is_active = true
        ORDER BY created_at DESC`,
        [userId]
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to get user encryption keys', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      throw error;
    }
  }

  /**
   * Rotate keys (generate new keys)
   */
  async rotateKeys(userId: string, deviceId: string): Promise<EncryptionKeys> {
    try {
      // Generate new keys
      const identityKeyPair = encryptionService.generateKeyPair();
      const signedPreKey = encryptionService.generateSignedPreKey(identityKeyPair);
      const oneTimePreKeys = encryptionService.generateOneTimePreKeys(100);

      // Create or update keys
      return await this.createOrUpdateKeys({
        userId,
        deviceId,
        identityKeyPair,
        signedPreKeyPair: signedPreKey.keyPair,
        signedPreKeySignature: signedPreKey.signature,
        oneTimePreKeys,
      });
    } catch (error) {
      logger.error('Failed to rotate encryption keys', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        deviceId,
      });
      throw error;
    }
  }

  /**
   * Deactivate keys for a device
   */
  async deactivateKeys(userId: string, deviceId: string): Promise<void> {
    try {
      await database.query(
        `UPDATE encryption_keys
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND device_id = $2`,
        [userId, deviceId]
      );

      logger.info('Encryption keys deactivated', {
        userId,
        deviceId,
      });
    } catch (error) {
      logger.error('Failed to deactivate encryption keys', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        deviceId,
      });
      throw error;
    }
  }
}

const keyStorageService = new KeyStorageService();
export default keyStorageService;
