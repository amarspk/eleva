import { Test, TestingModule } from '@nestjs/testing';
import { TenantContextMiddleware } from './tenant-context.middleware';
import { CacheService } from '../cache/cache.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { dbTenantContext } from '@zayjar/db';
import { JWT_CONFIG } from '../../auth/config/jwt.config';

describe('TenantContextMiddleware Unit Tests', () => {
  let middleware: TenantContextMiddleware;

  const mockCacheService = {
    get: jest.fn().mockImplementation((_key, fetchFn) => fetchFn()),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantContextMiddleware,
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    middleware = module.get<TenantContextMiddleware>(TenantContextMiddleware);
    jest.clearAllMocks();
  });

  it('should resolve tenant ID directly if override header is provided', async () => {
    const req = {
      headers: {
        'x-tenant-id': 'tenant-uuid-1234',
        host: 'localhost',
      },
    } as any;
    const res = {} as any;
    const next = jest.fn();

    // Act
    await middleware.use(req, res, next);

    // Assert
    expect(req['tenantId']).toBe('tenant-uuid-1234');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should reject requests with 404 if subdomain is unmapped', async () => {
    const req = {
      headers: {
        host: 'invalid.localhost',
      },
    } as any;
    const res = {} as any;
    const next = jest.fn();

    // Act & Assert
    await expect(middleware.use(req, res, next)).rejects.toThrow(NotFoundException);
    expect(next).not.toHaveBeenCalled();
  });

  /**
   * C-2 (AUTHZ-002) — platform-owner context must be derived ONLY from
   * signature-verified tokens. No decoded-but-unverified claim may reach the
   * fail-safe bypass.
   */
  describe('C-2 (AUTHZ-002) verified platform-owner derivation', () => {
    // Simulate the database answering "no such custom domain" for apex
    // lookups (the production runtime behavior at `localhost`) so control
    // reaches the fail-safe branch instead of erroring inside the fetch.
    beforeEach(() => {
      mockCacheService.get.mockImplementation(() => Promise.resolve(null));
    });

    const sign = (payload: Record<string, unknown>, secret = JWT_CONFIG.accessTokenSecret, expiresIn: string | number = '5m'): string =>
      jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);

    const apexReq = (token: string): any => ({
      headers: { host: 'localhost:8000', authorization: `Bearer ${token}` },
    });

    const captureNext = (): { next: jest.Mock; store: () => { tenantId?: string; isPlatformOwner?: boolean } | undefined } => {
      let seen: { tenantId?: string; isPlatformOwner?: boolean } | undefined;
      const next = jest.fn(() => {
        seen = dbTenantContext.getStore();
      });
      return { next, store: () => seen };
    };

    it('grants platform context for a SIGNATURE-VERIFIED PLATFORM_OWNER token at apex (behavior preserved)', async () => {
      const token = sign({ sub: 'p-1', tenantId: null, roles: ['PLATFORM_OWNER'], permissions: [] });
      const { next, store } = captureNext();
      await middleware.use(apexReq(token), {} as any, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(store()?.isPlatformOwner).toBe(true);
      expect(store()?.tenantId).toBeUndefined();
    });

    it('rejects a FORGED PLATFORM_OWNER token at apex (403 — no unverified claims reach authorization)', async () => {
      const forged = sign({ sub: 'p-x', tenantId: null, roles: ['PLATFORM_OWNER'], permissions: [] }, 'wrong-secret-entirely');
      const { next, store } = captureNext();
      await expect(middleware.use(apexReq(forged), {} as any, next)).rejects.toThrow(ForbiddenException);
      expect(next).not.toHaveBeenCalled();
      expect(store()).toBeUndefined();
    });

    it('rejects a structurally malformed Bearer token at apex (403)', async () => {
      const garbage = 'abc.' + Buffer.from(JSON.stringify({ roles: ['PLATFORM_OWNER'] })).toString('base64url') + '.xyz';
      await expect(middleware.use(apexReq(garbage), {} as any, {} as any as jest.Mock)).rejects.toThrow(ForbiddenException);
    });

    it('rejects an EXPIRED platform-owner token at apex (403 — expiry confers no privilege)', async () => {
      const expired = sign({ sub: 'p-1', tenantId: null, roles: ['PLATFORM_OWNER'] }, JWT_CONFIG.accessTokenSecret, -30);
      await expect(middleware.use(apexReq(expired), {} as any, {} as any as jest.Mock)).rejects.toThrow(ForbiddenException);
    });

    it('valid non-platform staff token at apex still 403s (pre-existing behavior unchanged)', async () => {
      const staff = sign({ sub: 's-1', tenantId: 'T-A', roles: ['RESTAURANT_OWNER'] });
      await expect(middleware.use(apexReq(staff), {} as any, {} as any as jest.Mock)).rejects.toThrow(ForbiddenException);
    });

    it('verified platform owner on a resolvable tenant host keeps BOTH tenant scope and platform flag (pre-existing store shape)', async () => {
      mockCacheService.get.mockImplementationOnce(() => Promise.resolve('tenant-uuid-abc'));
      const token = sign({ sub: 'p-1', tenantId: null, roles: ['PLATFORM_OWNER'] });
      const req = { headers: { host: 'albaik.localhost:8000', authorization: `Bearer ${token}` } } as any;
      const { next, store } = captureNext();
      await middleware.use(req, {} as any, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.tenantId).toBe('tenant-uuid-abc');
      expect(store()).toEqual({ tenantId: 'tenant-uuid-abc', isPlatformOwner: true });
    });
  });
});
