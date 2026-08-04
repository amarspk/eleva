import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { CsrfService } from './csrf.service';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { JWT_CONFIG } from '../../auth/config/jwt.config';
import { AuthenticatedRequest } from '../types/request.types';

const CSRF_HEADER = 'x-csrf-token';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

/**
 * Double-submit CSRF validation for state-changing requests (DOC-006 §5.3).
 *
 * ==========================================================================
 * DEFECT-I (AUDIT-014, runtime-proven): this guard was globally INERT.
 * ==========================================================================
 * It is registered as an `APP_GUARD` in `AppModule`. Nest executes guards in
 * the order global -> controller -> route, so this guard always runs BEFORE the
 * controller-level `JwtAuthGuard` that populates `request.user`. The previous
 * implementation read `request.user` and bailed out early:
 *
 *     const user = (request as AuthenticatedRequest).user;
 *     if (!user?.id) {
 *       return true;   // <-- ALWAYS taken in production
 *     }
 *
 * `request.user` was therefore *always* undefined and every one of the 51
 * mutating routes skipped CSRF validation entirely. Reproduced at runtime:
 *
 *     PUT /api/v1/menu/products/:id
 *       Authorization: Bearer <valid>
 *       X-CSRF-Token: TOTALLY-BOGUS-VALUE-123
 *     -> HTTP 200        (a forged token was accepted)
 *
 * The existing unit tests passed because they construct the execution context
 * with a `user` object injected by hand, which production never does.
 *
 * FIX: the guard no longer depends on another guard having run first. It
 * resolves the caller's identity from the `Authorization: Bearer` token itself
 * (verify-only — no side effects, no database access) and validates the
 * submitted CSRF token against the Redis-backed per-user token.
 *
 * Fail-closed ordering rules:
 *  - Non-mutating methods: allowed (nothing to protect).
 *  - `@Public()` routes: allowed (no session to bind a token to).
 *  - No/invalid bearer token: allowed THROUGH to `JwtAuthGuard`, which rejects
 *    it with a 401. Throwing 403 here instead would mask authentication
 *    failures behind a misleading CSRF error, and there is no session to forge
 *    a request against in that state anyway.
 *  - Valid bearer token: a valid `X-CSRF-Token` is now MANDATORY.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly logger = new Logger('CsrfGuard');

  constructor(
    private readonly csrfService: CsrfService,
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method;

    // Skip CSRF validation for non-mutating requests
    if (!MUTATING_METHODS.has(method)) {
      return true;
    }

    // Skip if route is decorated with @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // Resolve the caller independently of guard ordering (see DEFECT-I above).
    const userId = this.resolveUserId(request);
    if (!userId) {
      // Unauthenticated: let JwtAuthGuard produce the correct 401.
      return true;
    }

    const csrfToken = request.headers[CSRF_HEADER] as string | undefined;

    if (!csrfToken) {
      this.logger.warn(`CSRF token missing from ${method} request by user [${userId}]`);
      throw new ForbiddenException('CSRF token is required for mutating requests');
    }

    const isValid = await this.csrfService.validateToken(userId, csrfToken);

    if (!isValid) {
      this.logger.warn(`CSRF token validation failed for user [${userId}] on ${method} ${request.url}`);
      throw new ForbiddenException('CSRF token validation failed');
    }

    return true;
  }

  /**
   * Extracts and verifies the bearer token, returning its subject.
   *
   * Uses the same secret as `JwtStrategy`. Verification failures (expired,
   * tampered, wrong algorithm) resolve to `null` so the request falls through
   * to `JwtAuthGuard` for a proper 401 rather than being reported as a CSRF
   * problem. If `request.user` has already been populated (route-level guard
   * ordering, or a future refactor that moves this guard later) that value is
   * preferred and no re-verification is performed.
   */
  private resolveUserId(request: Request): string | null {
    const preAuthenticated = (request as AuthenticatedRequest).user;
    if (preAuthenticated?.id) {
      return preAuthenticated.id;
    }

    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return null;
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      return null;
    }

    try {
      const payload = this.jwtService.verify<{ sub?: string }>(token, {
        secret: JWT_CONFIG.accessTokenSecret,
      });
      return payload?.sub ?? null;
    } catch {
      return null;
    }
  }
}
