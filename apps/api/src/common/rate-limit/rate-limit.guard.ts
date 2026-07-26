import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus, Logger, CustomDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitService } from './rate-limit.service';

export const RATE_LIMIT_KEY = 'rateLimitTier';
export const RateLimit = (tier: 'public' | 'checkout' | 'auth', customLimit?: number, customWindowMs?: number): CustomDecorator<string> => {
  const { SetMetadata } = require('@nestjs/common');
  return SetMetadata(RATE_LIMIT_KEY, { tier, customLimit, customWindowMs });
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rateLimitMeta = this.reflector.getAllAndOverride<{ tier: 'public' | 'checkout' | 'auth'; customLimit?: number; customWindowMs?: number }>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no rate limit metadata, allow (no limiting)
    if (!rateLimitMeta) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Determine client key: IP + user id if authenticated
    const ip = request.ip || request.headers['x-forwarded-for'] || request.connection?.remoteAddress || 'unknown-ip';
    const userId = request.user?.id || request.user?.sub || '';
    const key = userId ? `${ip}:${userId}` : ip;

    const tierConfig = this.rateLimitService.getTierConfig(rateLimitMeta.tier);
    const config = {
      limit: rateLimitMeta.customLimit || tierConfig.limit,
      windowMs: rateLimitMeta.customWindowMs || tierConfig.windowMs,
      keyPrefix: tierConfig.keyPrefix,
    };

    const { limited, remaining, resetTime } = await this.rateLimitService.isRateLimited(key, config);

    // Set standard rate limit headers
    if (response) {
      response.setHeader('X-RateLimit-Limit', config.limit);
      response.setHeader('X-RateLimit-Remaining', remaining);
      response.setHeader('X-RateLimit-Reset', Math.ceil(resetTime / 1000));
      if (limited) {
        const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
        response.setHeader('Retry-After', retryAfter);
      }
    }

    if (limited) {
      this.logger.warn(`Rate limit exceeded for IP [${ip}] tier [${rateLimitMeta.tier}] key [${key}]`);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Max ${config.limit} requests per ${config.windowMs / 1000}s. Retry after ${Math.ceil((resetTime - Date.now()) / 1000)}s`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
