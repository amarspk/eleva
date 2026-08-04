import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { dbTenantContext } from '@zayjar/db';
import { JWT_CONFIG } from '../config/jwt.config';
import { AuthService } from '../auth.service';
import { AuthenticatedUser } from '../../common/types/request.types';

interface JwtTokenPayload {
  sub: string;
  email: string;
  tenantId: string | null;
  roles: string[];
  permissions: string[];
  /** Issued-at (seconds). Compared against the per-user revocation cut-off. */
  iat?: number;
}

interface JwtRequest {
  headers: {
    authorization?: string;
    'x-tenant-id'?: string | string[];
  };
  // Request-scoped tenant context resolved by TenantContextMiddleware
  // (subdomain / custom domain / X-Tenant-ID). Read at validation time to
  // reconcile it against the verified JWT tenant (C-1 / AUTHZ-001).
  tenantId?: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_CONFIG.accessTokenSecret,
      passReqToCallback: true,
    });
  }

  /**
   * Decodes and validates active JWT payloads.
   * Verifies that the token has not been blacklisted via logouts.
   */
  async validate(req: JwtRequest, payload: JwtTokenPayload): Promise<AuthenticatedUser> {
    // Extract raw bearer token from request header to check blacklist
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      const isBlacklisted = await this.authService.isTokenBlacklisted(token);
      if (isBlacklisted) {
        throw new UnauthorizedException('This access token has been revoked or blacklisted.');
      }
    }

    // ==========================================
    // AUDIT-004 review (ISSUE-1/ISSUE-2) — account-state revocation.
    // The blacklist above only covers tokens surrendered at logout, so it
    // cannot stop a user who was deactivated or deleted by an ADMINISTRATOR:
    // their already-issued JWT stayed valid for the remainder of its 15-minute
    // life because nothing here consulted account state (runtime-verified
    // pre-fix: soft-deleted user's token returned 200 on /auth/me and
    // /branches). A per-user revocation marker written by UserService is
    // checked here so the change takes effect on the very next request.
    // Cache lookup only — no database round-trip is added to the hot path.
    // ==========================================
    const revokedAt = await this.authService.getUserRevocationCutoff(payload.sub);
    if (revokedAt > 0 && typeof payload.iat === 'number' && payload.iat < revokedAt) {
      throw new UnauthorizedException(
        'This access token has been revoked because the account was deactivated or removed.',
      );
    }

    // ==========================================
    // C-1 (AUTHZ-001) — Tenant-context reconciliation.
    // The signature-verified JWT tenant is the ONLY authoritative tenant
    // identity for authenticated requests: a caller-supplied X-Tenant-ID can
    // never override it, and a middleware-resolved context that disagrees
    // with the verified claim is rejected. PLATFORM_OWNER tokens are exempt
    // (cross-tenant administration is their documented capability); this
    // block preserves platform-owner rules unchanged.
    // ==========================================
    const isPlatformOwner = payload.roles.includes('PLATFORM_OWNER');
    if (!isPlatformOwner && payload.tenantId) {
      const rawHeader = req.headers['x-tenant-id'];
      const headerTenantId = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
      if (headerTenantId && headerTenantId !== payload.tenantId) {
        throw new ForbiddenException('Tenant context mismatch: X-Tenant-ID does not match the authenticated tenant.');
      }
      if (req.tenantId && req.tenantId !== payload.tenantId) {
        throw new ForbiddenException('Tenant context mismatch: resolved tenant does not match the authenticated tenant.');
      }
      // Reconcile the request-scoped ALS context with the verified tenant so
      // every downstream repository operation is scoped by the JWT identity.
      const store = dbTenantContext.getStore();
      if (store) {
        store.tenantId = payload.tenantId;
      }
    }

    return {
      id: payload.sub,
      email: payload.email,
      tenantId: payload.tenantId,
      roles: payload.roles,
      permissions: payload.permissions,
    };
  }
}
