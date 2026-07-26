import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { CacheService } from '../cache/cache.service';

const CSRF_TOKEN_PREFIX = 'csrf:token:';
const CSRF_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days — matches refresh token TTL

@Injectable()
export class CsrfService {
  private readonly logger = new Logger('CsrfService');

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Generates a cryptographically random CSRF token, stores it in Redis
   * keyed by userId, and returns the token string.
   */
  async generateToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const key = `${CSRF_TOKEN_PREFIX}${userId}`;
    await this.cacheService.set(key, token, CSRF_TOKEN_TTL);
    this.logger.debug(`CSRF token generated for user [${userId}]`);
    return token;
  }

  /**
   * Validates a submitted CSRF token against the stored token for the given user.
   * Uses constant-time comparison to prevent timing attacks.
   */
  async validateToken(userId: string, token: string): Promise<boolean> {
    if (!token) {
      return false;
    }

    const key = `${CSRF_TOKEN_PREFIX}${userId}`;
    const storedToken = await this.cacheService.get<string | null>(key, async () => null);

    if (!storedToken) {
      this.logger.warn(`No CSRF token found for user [${userId}]`);
      return false;
    }

    // Constant-time comparison to prevent timing attacks
    try {
      const storedBuf = Buffer.from(storedToken, 'hex');
      const submittedBuf = Buffer.from(token, 'hex');

      if (storedBuf.length !== submittedBuf.length) {
        return false;
      }

      return crypto.timingSafeEqual(storedBuf, submittedBuf);
    } catch {
      return false;
    }
  }

  /**
   * Deletes the stored CSRF token for a user (called on logout).
   */
  async deleteToken(userId: string): Promise<void> {
    const key = `${CSRF_TOKEN_PREFIX}${userId}`;
    await this.cacheService.del(key);
    this.logger.debug(`CSRF token deleted for user [${userId}]`);
  }
}
