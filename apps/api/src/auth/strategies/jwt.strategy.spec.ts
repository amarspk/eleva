import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { dbTenantContext } from '@zayjar/db';
import { JwtStrategy } from './jwt.strategy';
import { AuthService } from '../auth.service';

/**
 * C-1 (AUTHZ-001) — runtime-semantic unit tests for tenant-context
 * reconciliation inside JwtStrategy.validate: the signature-verified JWT
 * tenant is the only authoritative identity; X-Tenant-ID can never override
 * it; mismatched middleware-resolved contexts are rejected; PLATFORM_OWNER
 * rules remain unchanged.
 */
describe('JwtStrategy — C-1 (AUTHZ-001) tenant reconciliation', () => {
  let strategy: JwtStrategy;
  const authService = { isTokenBlacklisted: jest.fn() } as unknown as AuthService;
  const staffPayload = {
    sub: 'u-1',
    email: 'staff@tenant-a.example',
    tenantId: 'T-A',
    roles: ['RESTAURANT_OWNER'],
    permissions: [],
  };

  const makeReq = (over: Record<string, unknown> = {}): any => ({
    headers: { authorization: 'Bearer tok' },
    tenantId: 'T-A',
    ...over,
  });

  beforeEach(() => {
    (authService.isTokenBlacklisted as jest.Mock).mockResolvedValue(false);
    strategy = new JwtStrategy(authService);
  });

  it('passes and leaves context reconciled when host tenant and JWT tenant match', async () => {
    await dbTenantContext.run({ tenantId: 'T-A' }, async () => {
      const user = await strategy.validate(makeReq(), staffPayload);
      expect(user.tenantId).toBe('T-A');
      expect(dbTenantContext.getStore()?.tenantId).toBe('T-A');
    });
  });

  it('rejects an X-Tenant-ID that does not match the authenticated tenant (403, never overrides JWT identity)', async () => {
    await dbTenantContext.run({ tenantId: 'T-B' }, async () => {
      const req = makeReq({ tenantId: 'T-B', headers: { authorization: 'Bearer tok', 'x-tenant-id': 'T-B' } });
      await expect(strategy.validate(req, staffPayload)).rejects.toThrow(ForbiddenException);
      await expect(strategy.validate(req, staffPayload)).rejects.toThrow('X-Tenant-ID does not match the authenticated tenant');
    });
  });

  it('rejects a middleware-resolved tenant context that disagrees with the JWT tenant (host-mismatch)', async () => {
    await dbTenantContext.run({ tenantId: 'T-B' }, async () => {
      const req = makeReq({ tenantId: 'T-B' });
      await expect(strategy.validate(req, staffPayload)).rejects.toThrow('resolved tenant does not match the authenticated tenant');
    });
  });

  it('accepts a matching X-Tenant-ID (verified identity intact)', async () => {
    await dbTenantContext.run({ tenantId: 'T-A' }, async () => {
      const req = makeReq({ headers: { authorization: 'Bearer tok', 'x-tenant-id': 'T-A' } });
      const user = await strategy.validate(req, staffPayload);
      expect(user.id).toBe('u-1');
      expect(dbTenantContext.getStore()?.tenantId).toBe('T-A');
    });
  });

  it('normalizes array-valued X-Tenant-ID headers before comparison', async () => {
    await dbTenantContext.run({ tenantId: 'T-A' }, async () => {
      const req = makeReq({ headers: { authorization: 'Bearer tok', 'x-tenant-id': ['T-A'] } });
      const user = await strategy.validate(req, staffPayload);
      expect(user.tenantId).toBe('T-A');
    });
  });

  it('exempts PLATFORM_OWNER from tenant reconciliation (platform rules preserved)', async () => {
    const ownerPayload = { ...staffPayload, tenantId: null, roles: ['PLATFORM_OWNER'] };
    await dbTenantContext.run({ tenantId: 'T-B', isPlatformOwner: true }, async () => {
      const user = await strategy.validate(makeReq({ tenantId: 'T-B' }), ownerPayload);
      expect(user.roles).toContain('PLATFORM_OWNER');
      // Platform scope from the middleware is left untouched for owners.
      expect(dbTenantContext.getStore()?.tenantId).toBe('T-B');
    });
  });

  it('tenant-less non-owner tokens skip reconciliation without throwing', async () => {
    const guestish = { ...staffPayload, tenantId: null };
    await dbTenantContext.run({ tenantId: 'T-A' }, async () => {
      const user = await strategy.validate(makeReq(), guestish);
      expect(user.tenantId).toBeNull();
    });
  });

  it('preserves the pre-existing blacklist rejection (regression)', async () => {
    (authService.isTokenBlacklisted as jest.Mock).mockResolvedValue(true);
    await expect(strategy.validate(makeReq(), staffPayload)).rejects.toThrow(UnauthorizedException);
  });
});
