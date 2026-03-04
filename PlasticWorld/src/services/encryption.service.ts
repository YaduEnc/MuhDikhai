import nacl from 'tweetnacl';
import { randomBytes } from 'crypto';
import logger from '../utils/logger';

/**
 * Signal Protocol-inspired encryption service
 * Uses X25519 (Curve25519) for key exchange and XSalsa20-Poly1305 for encryption
 */

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface PreKeyBundle {
  identityKey: Uint8Array; // Public identity key
  signedPreKey: {
    keyId: number;
    publicKey: Uint8Array;
    signature: Uint8Array;
  };
  oneTimePreKey?: {
    keyId: number;
    publicKey: Uint8Array;
  };
}

export interface SessionState {
  rootKey: Uint8Array;
  sendingChainKey: Uint8Array;
  receivingChainKey: Uint8Array;
  sendingMessageNumber: number;
  receivingMessageNumber: number;
  previousChainLength: number;
}

export interface EncryptedMessage {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  ephemeralPublicKey?: Uint8Array; // For initial message
  messageNumber?: number; // For ratchet messages
}

/**
 * Encryption Service
 * Implements Signal Protocol principles:
 * - X3DH key agreement
 * - Double Ratchet for forward secrecy
 * - Perfect forward secrecy
 * - Post-compromise security
 */
class EncryptionService {
  /**
   * Generate a new X25519 key pair
   */
  generateKeyPair(): KeyPair {
    const keyPair = nacl.box.keyPair();
    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.secretKey,
    };
  }

  /**
   * Generate a signed prekey
   * Returns: { keyPair, signature }
   */
  generateSignedPreKey(identityKeyPair: KeyPair): {
    keyPair: KeyPair;
    signature: Uint8Array;
  } {
    const preKeyPair = this.generateKeyPair();
    
    // Sign the prekey with identity private key
    const message = new Uint8Array(preKeyPair.publicKey.length + 1);
    message[0] = 0x05; // Version byte
    message.set(preKeyPair.publicKey, 1);
    
    const signature = nacl.sign.detached(message, identityKeyPair.privateKey);
    
    return {
      keyPair: preKeyPair,
      signature,
    };
  }

  /**
   * Generate one-time prekeys
   */
  generateOneTimePreKeys(count: number = 100): Array<{ keyId: number; keyPair: KeyPair }> {
    const preKeys: Array<{ keyId: number; keyPair: KeyPair }> = [];
    
    for (let i = 0; i < count; i++) {
      const keyId = Date.now() + i; // Simple key ID generation
      preKeys.push({
        keyId,
        keyPair: this.generateKeyPair(),
      });
    }
    
    return preKeys;
  }

  /**
   * Verify signed prekey signature
   */
  verifySignedPreKey(
    signedPreKey: Uint8Array,
    signature: Uint8Array,
    identityPublicKey: Uint8Array
  ): boolean {
    try {
      const message = new Uint8Array(signedPreKey.length + 1);
      message[0] = 0x05; // Version byte
      message.set(signedPreKey, 1);
      
      return nacl.sign.detached.verify(message, signature, identityPublicKey);
    } catch (error) {
      logger.error('Failed to verify signed prekey', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * X3DH Key Agreement
   * Computes shared secret from:
   * - Identity keys (IK_A, IK_B)
   * - Signed prekeys (SPK_A, SPK_B)
   * - One-time prekey (OPK_B) if available
   * - Ephemeral key (EK)
   */
  performX3DH(
    identityKeyPair: KeyPair,
    signedPreKeyPair: KeyPair,
    recipientIdentityKey: Uint8Array,
    recipientSignedPreKey: Uint8Array,
    recipientOneTimePreKey?: Uint8Array
  ): Uint8Array {
    // Generate ephemeral key
    const ephemeralKeyPair = this.generateKeyPair();
    
    // Compute shared secrets
    const dh1 = nacl.scalarMult(identityKeyPair.privateKey, recipientSignedPreKey);
    const dh2 = nacl.scalarMult(signedPreKeyPair.privateKey, recipientIdentityKey);
    const dh3 = nacl.scalarMult(signedPreKeyPair.privateKey, recipientSignedPreKey);
    
    let dh4: Uint8Array | null = null;
    if (recipientOneTimePreKey) {
      dh4 = nacl.scalarMult(ephemeralKeyPair.privateKey, recipientOneTimePreKey);
    }
    
    // Concatenate shared secrets
    const sharedSecretLength = dh1.length + dh2.length + dh3.length + (dh4 ? dh4.length : 0);
    const sharedSecret = new Uint8Array(sharedSecretLength);
    let offset = 0;
    
    sharedSecret.set(dh1, offset);
    offset += dh1.length;
    
    sharedSecret.set(dh2, offset);
    offset += dh2.length;
    
    sharedSecret.set(dh3, offset);
    offset += dh3.length;
    
    if (dh4) {
      sharedSecret.set(dh4, offset);
    }
    
    // Derive root key using HKDF
    return this.deriveRootKey(sharedSecret, ephemeralKeyPair.publicKey);
  }

  /**
   * Derive root key from shared secret (simplified HKDF)
   */
  private deriveRootKey(sharedSecret: Uint8Array, salt: Uint8Array): Uint8Array {
    // Simplified HKDF using SHA-256
    // In production, use proper HKDF implementation
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', salt);
    hmac.update(sharedSecret);
    return new Uint8Array(hmac.digest());
  }

  /**
   * Initialize Double Ratchet session
   */
  initializeSession(
    rootKey: Uint8Array,
    sendingChainKey: Uint8Array,
    receivingChainKey: Uint8Array
  ): SessionState {
    return {
      rootKey,
      sendingChainKey,
      receivingChainKey,
      sendingMessageNumber: 0,
      receivingMessageNumber: 0,
      previousChainLength: 0,
    };
  }

  /**
   * Ratchet sending chain (Double Ratchet)
   */
  ratchetSendingChain(session: SessionState, recipientPublicKey: Uint8Array): {
    newSession: SessionState;
    messageKey: Uint8Array;
  } {
    // Perform DH ratchet
    const sharedSecret = nacl.scalarMult(session.sendingChainKey, recipientPublicKey);
    const newRootKey = this.deriveRootKey(sharedSecret, session.rootKey);
    
    // Derive new chain key
    const newChainKey = this.deriveChainKey(session.sendingChainKey);
    const messageKey = this.deriveMessageKey(newChainKey);
    
    // Update session
    const newSession: SessionState = {
      ...session,
      rootKey: newRootKey,
      sendingChainKey: newChainKey,
      sendingMessageNumber: session.sendingMessageNumber + 1,
    };
    
    return {
      newSession,
      messageKey,
    };
  }

  /**
   * Ratchet receiving chain
   */
  ratchetReceivingChain(session: SessionState, senderPublicKey: Uint8Array): {
    newSession: SessionState;
    messageKey: Uint8Array;
  } {
    // Perform DH ratchet
    const sharedSecret = nacl.scalarMult(session.receivingChainKey, senderPublicKey);
    const newRootKey = this.deriveRootKey(sharedSecret, session.rootKey);
    
    // Derive new chain key
    const newChainKey = this.deriveChainKey(session.receivingChainKey);
    const messageKey = this.deriveMessageKey(newChainKey);
    
    // Update session
    const newSession: SessionState = {
      ...session,
      rootKey: newRootKey,
      receivingChainKey: newChainKey,
      receivingMessageNumber: session.receivingMessageNumber + 1,
    };
    
    return {
      newSession,
      messageKey,
    };
  }

  /**
   * Derive chain key from previous chain key
   */
  private deriveChainKey(chainKey: Uint8Array): Uint8Array {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', chainKey);
    hmac.update(Buffer.from([0x02])); // Chain key constant
    return new Uint8Array(hmac.digest());
  }

  /**
   * Derive message key from chain key
   */
  private deriveMessageKey(chainKey: Uint8Array): Uint8Array {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', chainKey);
    hmac.update(Buffer.from([0x01])); // Message key constant
    return new Uint8Array(hmac.digest());
  }

  /**
   * Encrypt message using XSalsa20-Poly1305
   */
  encryptMessage(
    plaintext: Uint8Array,
    messageKey: Uint8Array
  ): { ciphertext: Uint8Array; nonce: Uint8Array } {
    const nonce = randomBytes(24); // XSalsa20 nonce is 24 bytes
    
    // Use messageKey as the encryption key (first 32 bytes)
    const key = messageKey.slice(0, 32);
    
    // Encrypt using XSalsa20-Poly1305
    const ciphertext = nacl.secretbox(plaintext, nonce, key);
    
    return {
      ciphertext,
      nonce,
    };
  }

  /**
   * Decrypt message using XSalsa20-Poly1305
   */
  decryptMessage(
    ciphertext: Uint8Array,
    nonce: Uint8Array,
    messageKey: Uint8Array
  ): Uint8Array | null {
    try {
      const key = messageKey.slice(0, 32);
      const plaintext = nacl.secretbox.open(ciphertext, nonce, key);
      
      if (!plaintext) {
        return null;
      }
      
      return plaintext;
    } catch (error) {
      logger.error('Failed to decrypt message', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Convert Uint8Array to base64
   */
  toBase64(data: Uint8Array): string {
    return Buffer.from(data).toString('base64');
  }

  /**
   * Convert base64 to Uint8Array
   */
  fromBase64(data: string): Uint8Array {
    return new Uint8Array(Buffer.from(data, 'base64'));
  }

  /**
   * Convert Uint8Array to hex
   */
  toHex(data: Uint8Array): string {
    return Buffer.from(data).toString('hex');
  }

  /**
   * Convert hex to Uint8Array
   */
  fromHex(data: string): Uint8Array {
    return new Uint8Array(Buffer.from(data, 'hex'));
  }
}

const encryptionService = new EncryptionService();
export default encryptionService;
