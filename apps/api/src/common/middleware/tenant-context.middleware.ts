import { Injectable, NestMiddleware, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { CacheService } from '../cache/cache.service';
import { prisma, dbTenantContext } from '@zayjar/db';
import * as jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../../auth/config/jwt.config';
import { RequestWithTenant } from '../types/request.types';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger('TenantContextMiddleware');

  constructor(private readonly cacheService: CacheService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const host = req.headers.host || '';
    const correlationId = req.headers['x-correlation-id'] || `req-${Math.random().toString(36).substr(2, 9)}`;
    req.headers['x-correlation-id'] = correlationId;

    let tenantId: string | null = null;
    let isPlatformOwner = false;

    // Evaluate if the actor user is a Platform Owner administrator
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        // C-2 (AUTHZ-002): platform-owner context is derived ONLY from a
        // signature-verified token. Forged, malformed, or expired tokens
        // confer NO platform privilege (previously jwt.decode accepted any
        // well-formed claims unverified). Protected routes independently
        // re-verify the token through JwtAuthGuard/JwtStrategy (C-1), so
        // request flow for valid authenticated users is unchanged; only the
        // unverified-claims hole is closed here.
        const verified = jwt.verify(token, JWT_CONFIG.accessTokenSecret) as unknown as { roles?: unknown };
        if (Array.isArray(verified.roles) && (verified.roles as unknown[]).includes('PLATFORM_OWNER')) {
          isPlatformOwner = true;
        }
      } catch (err) {
        // Verification failures are ignored here; the JwtAuthGuard will validate and reject properly later
      }
    }

    try {
      // 1. Check for manual override developer header
      const headerTenantId = req.headers['x-tenant-id'];
      if (headerTenantId && typeof headerTenantId === 'string') {
        tenantId = headerTenantId;
      } else {
        // 2. Extract subdomain or custom domain
        const parsedHost = host.split(':')[0]; // Strip ports
        
        if (parsedHost.endsWith('.zayjar.com') || parsedHost.endsWith('.localhost')) {
          const subdomain = parsedHost.replace('.zayjar.com', '').replace('.localhost', '');
          
          if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
            // Check high-speed Redis cache first
            const cacheKey = `subdomain:${subdomain}`;
            tenantId = await this.cacheService.get(cacheKey, async () => {
              // REFINEMENT: Use findUnique as subdomain is a unique index key
              const tenant = await prisma.tenant.findUnique({
                where: { subdomain },
                select: { id: true }
              });
              return tenant ? tenant.id : null;
            }, 3600);
          }
        } else {
          // Check for enterprise custom domains (e.g. menu.burgers.com)
          const cacheKey = `custom_domain:${parsedHost}`;
          tenantId = await this.cacheService.get(cacheKey, async () => {
            // REFINEMENT: Use findUnique as customDomain is a unique index key
            const tenant = await prisma.tenant.findUnique({
              where: { customDomain: parsedHost },
              select: { id: true }
            });
            return tenant ? tenant.id : null;
          }, 3600);
        }
      }

      // ==========================================
      // FAIL-SAFE context verification
      // ==========================================
      if (!tenantId && !isPlatformOwner) {
        // Reject immediately with Forbidden (403) if neither context exists
        throw new ForbiddenException('Access denied: Missing valid tenant context.');
      }

      // 3. Inject context properties into dbTenantContext storage
      dbTenantContext.run({ tenantId: tenantId || undefined, isPlatformOwner }, () => {
        (req as RequestWithTenant).tenantId = tenantId;
        next();
      });

    } catch (err) {
      if (err instanceof ForbiddenException || err instanceof NotFoundException) {
        throw err;
      }
      this.logger.error(`A fatal exception occurred during tenant domain scoping: ${(err as Error).message}`);
      throw new NotFoundException('Unable to resolve active tenant domain context.');
    }
  }
}
