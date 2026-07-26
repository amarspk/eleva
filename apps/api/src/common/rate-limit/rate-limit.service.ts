import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import type { RedisClientType } from 'redis';

export interface RateLimitConfig {
  limit: number;
  windowMs: number; // window in ms
  keyPrefix: string;
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  // In-memory fallback when Redis offline
  private readonly memoryStore = new Map<string, { count: number; resetTime: number }>();

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Token bucket / Fixed window implementation using Redis or in-memory fallback
   * Per DOC-006 5.6 Distributed Rate Limiting via Redis Token Bucket
   */
  async isRateLimited(key: string, config: RateLimitConfig): Promise<{ limited: boolean; remaining: number; resetTime: number }> {
    const fullKey = `ratelimit:${config.keyPrefix}:${key}`;
    const now = Date.now();
    const windowSec = Math.ceil(config.windowMs / 1000);

    // Try Redis first
    try {
      if (this.cacheService.isCacheActive && this.cacheService.isCacheActive()) {
        // Use CacheService get/set with custom logic for atomic increment
        // For simplicity, we use direct Redis client if available via cacheService
        // Fallback to memory if Redis operation fails
        const cacheServiceAccess = this.cacheService as unknown as { redisClient: RedisClientType | null; isConnected: boolean };
        const redisClient = cacheServiceAccess.redisClient;

        if (redisClient && cacheServiceAccess.isConnected) {
          // Atomic INCR + EXPIRE using Redis
          const count = await redisClient.incr(fullKey);
          if (count === 1) {
            await redisClient.expire(fullKey, windowSec);
          }
          const ttl = await redisClient.ttl(fullKey);
          const resetTime = now + ttl * 1000;

          const remaining = Math.max(0, config.limit - count);
          const limited = count > config.limit;

          if (limited) {
            this.logger.warn(`Rate limit exceeded for key [${fullKey}] count [${count}] limit [${config.limit}]`);
          }

          return { limited, remaining, resetTime };
        }
      }
    } catch (err) {
      this.logger.warn(`Redis rate limit check failed for [${fullKey}]: ${(err as Error).message}, falling back to memory`);
    }

    // In-memory fallback
    const entry = this.memoryStore.get(fullKey);
    if (!entry || now > entry.resetTime) {
      // New window
      this.memoryStore.set(fullKey, { count: 1, resetTime: now + config.windowMs });
      return { limited: false, remaining: config.limit - 1, resetTime: now + config.windowMs };
    }

    entry.count++;
    const remaining = Math.max(0, config.limit - entry.count);
    const limited = entry.count > config.limit;

    if (limited) {
      this.logger.warn(`Rate limit exceeded (memory) for key [${fullKey}] count [${entry.count}]`);
    }

    return { limited, remaining, resetTime: entry.resetTime };
  }

  // Predefined tiers per DOC-006 5.6

  getTierConfig(tier: 'public' | 'checkout' | 'auth'): RateLimitConfig {
    switch (tier) {
      case 'public':
        return { limit: 120, windowMs: 60 * 1000, keyPrefix: 'public' }; // 120 req/min per IP per DOC
      case 'checkout':
        return { limit: 30, windowMs: 60 * 1000, keyPrefix: 'checkout' }; // 30 req/min per IP
      case 'auth':
        return { limit: 10, windowMs: 60 * 1000, keyPrefix: 'auth' }; // 10 req/min per IP per DOC
      default:
        return { limit: 120, windowMs: 60 * 1000, keyPrefix: 'default' };
    }
  }

  /**
   * Cleanup memory store periodically (optional)
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.memoryStore.entries()) {
      if (now > entry.resetTime) {
        this.memoryStore.delete(key);
      }
    }
  }
}
