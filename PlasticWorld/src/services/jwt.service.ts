import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import logger from '../utils/logger';

export interface TokenPayload {
  userId: string;
  deviceId: string;
  type: 'access' | 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}

class JWTService {
  private secret: string | null = null;
  private readonly accessExpiresIn: string;
  private readonly refreshExpiresIn: string;
  private readonly issuer: string;

  constructor() {
    // Don't load secret in constructor - load lazily when needed
    // This allows dotenv to load first
    this.accessExpiresIn = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
    this.refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
    this.issuer = process.env.JWT_ISSUER || 'plasticworld-api';
  }

  private getSecret(): string {
    if (!this.secret) {
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw new Error('JWT_SECRET is not defined in environment variables');
      }
      this.secret = secret;
      if (this.secret.length < 32) {
        logger.warn('JWT_SECRET is less than 32 characters. Consider using a stronger secret.');
      }
    }
    return this.secret;
  }

  /**
   * Generate access and refresh token pair
   */
  generateTokenPair(userId: string, deviceId: string): TokenPair {
    const accessPayload: TokenPayload = {
      userId,
      deviceId,
      type: 'access',
    };

    const refreshPayload: TokenPayload = {
      userId,
      deviceId,
      type: 'refresh',
    };

    const secret = this.getSecret();
    const accessToken = jwt.sign(accessPayload, secret, {
      expiresIn: this.accessExpiresIn,
      issuer: this.issuer,
    } as jwt.SignOptions);

    const refreshToken = jwt.sign(refreshPayload, secret, {
      expiresIn: this.refreshExpiresIn,
      issuer: this.issuer,
    } as jwt.SignOptions);

    // Calculate expiration dates
    const accessExpiresAt = this.getExpirationDate(this.accessExpiresIn);
    const refreshExpiresAt = this.getExpirationDate(this.refreshExpiresIn);

    return {
      accessToken,
      refreshToken,
      accessExpiresAt,
      refreshExpiresAt,
    };
  }

  /**
   * Verify and decode access token
   */
  verifyAccessToken(token: string): TokenPayload {
    try {
      const secret = this.getSecret();
      const decoded = jwt.verify(token, secret, {
        issuer: this.issuer,
      }) as TokenPayload;

      if (decoded.type !== 'access') {
        throw new Error('Invalid token type. Expected access token.');
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Access token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid access token');
      }
      throw error;
    }
  }

  /**
   * Verify and decode refresh token
   */
  verifyRefreshToken(token: string): TokenPayload {
    try {
      const secret = this.getSecret();
      const decoded = jwt.verify(token, secret, {
        issuer: this.issuer,
      }) as TokenPayload;

      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type. Expected refresh token.');
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Refresh token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid refresh token');
      }
      throw error;
    }
  }

  /**
   * Hash token for storage (one-way hash)
   */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Calculate expiration date from expiresIn string
   */
  private getExpirationDate(expiresIn: string): Date {
    const now = Date.now();
    let milliseconds = 0;

    if (expiresIn.endsWith('m')) {
      const minutes = parseInt(expiresIn.slice(0, -1), 10);
      milliseconds = minutes * 60 * 1000;
    } else if (expiresIn.endsWith('h')) {
      const hours = parseInt(expiresIn.slice(0, -1), 10);
      milliseconds = hours * 60 * 60 * 1000;
    } else if (expiresIn.endsWith('d')) {
      const days = parseInt(expiresIn.slice(0, -1), 10);
      milliseconds = days * 24 * 60 * 60 * 1000;
    } else if (expiresIn.endsWith('s')) {
      const seconds = parseInt(expiresIn.slice(0, -1), 10);
      milliseconds = seconds * 1000;
    } else {
      // Default to 15 minutes if format is unknown
      milliseconds = 15 * 60 * 1000;
    }

    return new Date(now + milliseconds);
  }
}

// Export singleton instance
const jwtService = new JWTService();
export default jwtService;
