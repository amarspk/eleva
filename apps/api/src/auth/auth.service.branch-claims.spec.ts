import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { CacheService } from '../common/cache/cache.service';
import { prisma } from '@zayjar/db';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock-hashed-password'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

jest.mock('@zayjar/db', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    tenant: {
      findUnique: jest.fn(),
    },
  },
  dbTenantContext: {
    run: (_store: unknown, callback: () => unknown) => callback(),
  },
}));

/**
 * Phase 4 P0 — the JWT must carry the user's assigned branch IDs
 * (from the persistent user_branches relation) so CaslAbilityFactory can
 * enforce branch-scoped ABAC server-side for CASHIER / KITCHEN_STAFF /
 * BRANCH_MANAGER.
 */
describe('AuthService — Phase 4 P0 branch claims', () => {
  let service: AuthService;
  const mockCacheService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    setStrict: jest.fn().mockResolvedValue(true),
  };

  const userFindFirst = prisma.user.findFirst as jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env.DATABASE_URL;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: new JwtService({ secret: 'test-secret-0123456789abcdef' }) },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  const baseUser = {
    id: 'u-1',
    email: 'cashier@albaik.com',
    tenantId: 't-1',
    firstName: 'Omar',
    lastName: 'Khalil',
    passwordHash: 'mock-hash',
    isActive: true,
    mfaEnabled: false,
    mfaSecret: null,
    userRoles: [
      {
        role: {
          name: 'CASHIER',
          rolePermissions: [
            { permission: { action: 'read', resource: 'order' } },
            { permission: { action: 'create', resource: 'order' } },
          ],
        },
      },
    ],
  };

  it('returns the user assigned branch IDs from user_branches', async () => {
    userFindFirst.mockResolvedValue({
      ...baseUser,
      userBranches: [
        { branchId: 'branch-1' },
        { branchId: 'branch-2' },
      ],
    });

    const profile = await service.validateLogin('cashier@albaik.com', 'Demo1234!', undefined, 't-1');

    expect(profile.branches).toEqual(['branch-1', 'branch-2']);
    expect(profile.roles).toEqual(['CASHIER']);
  });

  it('filters out soft-deleted branches from the claims', async () => {
    userFindFirst.mockResolvedValue({
      ...baseUser,
      userBranches: [
        { branchId: 'branch-1' },
        { branchId: 'branch-2' },
      ],
    });

    await service.validateLogin('cashier@albaik.com', 'Demo1234!', undefined, 't-1');

    // The userBranches include must filter by branch.deletedAt === null so a
    // revoked branch never survives into the JWT.
    const include = userFindFirst.mock.calls[0][0].include;
    expect(include.userBranches.where).toEqual({ branch: { deletedAt: null } });
  });

  it('returns an empty branch list for tenant-wide roles (owners)', async () => {
    userFindFirst.mockResolvedValue({
      ...baseUser,
      userRoles: [
        {
          role: {
            name: 'RESTAURANT_OWNER',
            rolePermissions: [],
          },
        },
      ],
      userBranches: [],
    });

    const profile = await service.validateLogin('admin@albaik.com', 'Demo1234!', undefined, 't-1');
    expect(profile.branches).toEqual([]);
  });

  it('generateTokens embeds the branches claim into the access token', async () => {
    const jwt = new JwtService({ secret: 'test-secret-0123456789abcdef' });
    const tokens = await service.generateTokens({
      sub: 'u-1',
      email: 'cashier@albaik.com',
      tenantId: 't-1',
      roles: ['CASHIER'],
      permissions: ['order:read'],
      branches: ['branch-1'],
    });

    const decoded = jwt.decode(tokens.accessToken) as Record<string, unknown>;
    expect(decoded.branches).toEqual(['branch-1']);
  });
});
