import encryptionService, { SessionState } from './encryption.service';
import keyStorageService from './keyStorage.service';
import redisClient from '../config/redis';
import logger from '../utils/logger';
import { KeyPair } from './encryption.service';

/**
 * Key Exchange Service
 * Handles X3DH key agreement and session management
 */
class KeyExchangeService {
  private readonly SESSION_PREFIX = 'session:';
  private readonly SESSION_TTL = 7 * 24 * 60 * 60; // 7 days

  /**
   * Initialize encryption keys for a device
   */
  async initializeKeys(userId: string, deviceId: string): Promise<{
    identityKeyPublic: string;
    signedPreKeyPublic: string;
    signedPreKeySignature: string;
    prekeyCount: number;
  }> {
    try {
      // Generate identity key pair
      const identityKeyPair = encryptionService.generateKeyPair();
      
      // Generate signed prekey
      const signedPreKey = encryptionService.generateSignedPreKey(identityKeyPair);
      
      // Generate one-time prekeys
      const oneTimePreKeys = encryptionService.generateOneTimePreKeys(100);

      // Store keys
      const storedKeys = await keyStorageService.createOrUpdateKeys({
        userId,
        deviceId,
        identityKeyPair,
        signedPreKeyPair: signedPreKey.keyPair,
        signedPreKeySignature: signedPreKey.signature,
        oneTimePreKeys,
      });

      return {
        identityKeyPublic: encryptionService.toBase64(identityKeyPair.publicKey),
        signedPreKeyPublic: encryptionService.toBase64(signedPreKey.keyPair.publicKey),
        signedPreKeySignature: encryptionService.toBase64(signedPreKey.signature),
        prekeyCount: storedKeys.prekeyCount,
      };
    } catch (error) {
      logger.error('Failed to initialize encryption keys', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        deviceId,
      });
      throw error;
    }
  }

  /**
   * Get prekey bundle for a user (for X3DH key exchange)
   */
  async getPreKeyBundle(userId: string, deviceId: string): Promise<{
    identityKey: string;
    signedPreKey: {
      keyId: number;
      publicKey: string;
      signature: string;
    };
    oneTimePreKey?: {
      keyId: number;
      publicKey: string;
    };
  } | null> {
    try {
      const bundle = await keyStorageService.getPreKeyBundle(userId, deviceId);
      
      if (!bundle) {
        return null;
      }

      return {
        identityKey: encryptionService.toBase64(bundle.identityKey),
        signedPreKey: {
          keyId: bundle.signedPreKey.keyId,
          publicKey: encryptionService.toBase64(bundle.signedPreKey.publicKey),
          signature: encryptionService.toBase64(bundle.signedPreKey.signature),
        },
        oneTimePreKey: bundle.oneTimePreKey ? {
          keyId: bundle.oneTimePreKey.keyId,
          publicKey: encryptionService.toBase64(bundle.oneTimePreKey.publicKey),
        } : undefined,
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
   * Perform X3DH key exchange and establish session
   * This is called by the sender to establish a session with the recipient
   */
  async establishSession(
    senderUserId: string,
    senderDeviceId: string,
    recipientUserId: string,
    recipientDeviceId: string
  ): Promise<{
    sessionId: string;
    rootKey: string;
    sendingChainKey: string;
    receivingChainKey: string;
  }> {
    try {
      // Get sender's keys
      const senderKeys = await keyStorageService.getKeysByDevice(senderUserId, senderDeviceId);
      if (!senderKeys) {
        throw new Error('Sender keys not found. Please initialize keys first.');
      }

      // Get recipient's prekey bundle
      const recipientBundle = await keyStorageService.getPreKeyBundle(recipientUserId, recipientDeviceId);
      if (!recipientBundle) {
        throw new Error('Recipient prekey bundle not found');
      }

      // Convert stored keys to KeyPair format
      const senderIdentityKeyPair: KeyPair = {
        publicKey: Buffer.from(senderKeys.identityKeyPublic),
        privateKey: Buffer.from(senderKeys.identityKeyPublic), // Note: We don't store private keys on server
      };

      const senderSignedPreKeyPair: KeyPair = {
        publicKey: Buffer.from(senderKeys.signedPrekeyPublic),
        privateKey: Buffer.from(senderKeys.signedPrekeyPublic), // Note: Private keys should be on client
      };

      // Perform X3DH (Note: This is a simplified version)
      // In production, private keys should never leave the client
      // The server only stores public keys and facilitates key exchange
      const rootKey = encryptionService.performX3DH(
        senderIdentityKeyPair,
        senderSignedPreKeyPair,
        recipientBundle.identityKey,
        recipientBundle.signedPreKey.publicKey,
        recipientBundle.oneTimePreKey?.publicKey
      );

      // Consume one-time prekey if used
      if (recipientBundle.oneTimePreKey) {
        await keyStorageService.consumeOneTimePreKey(
          recipientUserId,
          recipientDeviceId,
          recipientBundle.oneTimePreKey.keyId
        );
      }

      // Initialize session state
      const sendingChainKey = rootKey.slice(0, 32);
      const receivingChainKey = rootKey.slice(32, 64) || rootKey.slice(0, 32);

      const session: SessionState = encryptionService.initializeSession(
        rootKey,
        sendingChainKey,
        receivingChainKey
      );

      // Store session in Redis
      const sessionId = `${senderUserId}:${senderDeviceId}:${recipientUserId}:${recipientDeviceId}`;
      await this.saveSession(sessionId, session);

      logger.info('Session established', {
        sessionId,
        senderUserId,
        recipientUserId,
      });

      return {
        sessionId,
        rootKey: encryptionService.toBase64(rootKey),
        sendingChainKey: encryptionService.toBase64(sendingChainKey),
        receivingChainKey: encryptionService.toBase64(receivingChainKey),
      };
    } catch (error) {
      logger.error('Failed to establish session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        senderUserId,
        recipientUserId,
      });
      throw error;
    }
  }

  /**
   * Save session to Redis
   */
  private async saveSession(sessionId: string, session: SessionState): Promise<void> {
    try {
      const key = `${this.SESSION_PREFIX}${sessionId}`;
      const sessionData = {
        rootKey: encryptionService.toBase64(session.rootKey),
        sendingChainKey: encryptionService.toBase64(session.sendingChainKey),
        receivingChainKey: encryptionService.toBase64(session.receivingChainKey),
        sendingMessageNumber: session.sendingMessageNumber,
        receivingMessageNumber: session.receivingMessageNumber,
        previousChainLength: session.previousChainLength,
      };

      await redisClient.set(key, JSON.stringify(sessionData), this.SESSION_TTL);
    } catch (error) {
      logger.error('Failed to save session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId,
      });
      throw error;
    }
  }

  /**
   * Get session from Redis
   */
  async getSession(sessionId: string): Promise<SessionState | null> {
    try {
      const key = `${this.SESSION_PREFIX}${sessionId}`;
      const sessionData = await redisClient.get(key);

      if (!sessionData) {
        return null;
      }

      const parsed = JSON.parse(sessionData);
      return {
        rootKey: encryptionService.fromBase64(parsed.rootKey),
        sendingChainKey: encryptionService.fromBase64(parsed.sendingChainKey),
        receivingChainKey: encryptionService.fromBase64(parsed.receivingChainKey),
        sendingMessageNumber: parsed.sendingMessageNumber,
        receivingMessageNumber: parsed.receivingMessageNumber,
        previousChainLength: parsed.previousChainLength,
      };
    } catch (error) {
      logger.error('Failed to get session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId,
      });
      return null;
    }
  }

  /**
   * Update session in Redis
   */
  async updateSession(sessionId: string, session: SessionState): Promise<void> {
    await this.saveSession(sessionId, session);
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      const key = `${this.SESSION_PREFIX}${sessionId}`;
      await redisClient.del(key);
    } catch (error) {
      logger.error('Failed to delete session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId,
      });
    }
  }

  /**
   * Rotate keys for a device
   */
  async rotateKeys(userId: string, deviceId: string): Promise<{
    identityKeyPublic: string;
    signedPreKeyPublic: string;
    signedPreKeySignature: string;
    prekeyCount: number;
  }> {
    try {
      const storedKeys = await keyStorageService.rotateKeys(userId, deviceId);

      return {
        identityKeyPublic: encryptionService.toBase64(Buffer.from(storedKeys.identityKeyPublic)),
        signedPreKeyPublic: encryptionService.toBase64(Buffer.from(storedKeys.signedPrekeyPublic)),
        signedPreKeySignature: encryptionService.toBase64(Buffer.from(storedKeys.signedPrekeySignature)),
        prekeyCount: storedKeys.prekeyCount,
      };
    } catch (error) {
      logger.error('Failed to rotate keys', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        deviceId,
      });
      throw error;
    }
  }
}

const keyExchangeService = new KeyExchangeService();
export default keyExchangeService;
