import { UserService } from './user.service';
import { AuthService } from '../auth/auth.service';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { prisma } from '@zayjar/db';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock-hash'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

const TENANT_A = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb';
const BRANCH_A = 'cccccccc-3333-4ccc-8ccc-cccccccccccc';
const BRANCH_FOREIGN = 'dddddddd-4444-4ddd-8ddd-dddddddddddd';

/** Acting caller: an owner, so role grants of OWNER/MANAGER/CASHIER are allowed. */
const OWNER_ACTOR = {
  id: 'eeeeeeee-5555-4eee-8eee-eeeeeeeeeeee',
  roles: ['RESTAURANT_OWNER'],
  permissions: ['user:read','user:create','user:update','user:delete','order:read','order:write','menu:read','menu:write','branch:read','branch:write','customer:read','customer:write','kds:read','kds:write','tenant:update'],
};

/**
 * AUDIT-004 — staff user management.
 * Covers CRUD, role assignment, and the two isolation boundaries
 * (tenant + branch) that make the feature safe in a multi-tenant platform.
 */

/**
 * Builds a transaction-client double. `$executeRaw` backs the per-tenant
 * advisory lock and `user.count` backs the last-owner guard, both of which now
 * run INSIDE the transaction (race-safety fix).
 */
function makeTx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    user: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(1),
    },
    role: { findMany: jest.fn().mockResolvedValue([]) },
    branch: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  };
}

describe('UserService (AUDIT-004 — staff user management)', () => {
  let service: UserService;
  let authService: {
    hashPassword: jest.Mock;
    revokeAllUserTokens: jest.Mock;
    // AUDIT-005: one-time email-verification helpers used by createUser.
    createEmailVerification: jest.Mock;
    sendVerificationEmail: jest.Mock;
  };

  const baseUserRow = {
    id: USER_ID,
    tenantId: TENANT_A,
    firstName: 'Sara',
    lastName: 'Khan',
    email: 'sara@albaik.com',
    phoneNumber: null,
    isActive: true,
    mfaEnabled: false,
    lastLoginAt: null,
    createdAt: new Date('2026-08-03T00:00:00Z'),
    updatedAt: new Date('2026-08-03T00:00:00Z'),
    deletedAt: null,
    passwordHash: 'hashed-secret',
    mfaSecret: 'super-secret-totp',
    userRoles: [{ role: { id: 'role-1', name: 'CASHIER' } }],
    userBranches: [{ branchId: BRANCH_A }],
  };

  beforeEach(() => {
    authService = {
      hashPassword: jest.fn().mockResolvedValue('argon2-hash'),
      revokeAllUserTokens: jest.fn().mockResolvedValue(undefined),
      // AUDIT-005: one-time email-verification token helpers used by createUser.
      createEmailVerification: jest.fn().mockReturnValue({
        rawToken: 'raw-verify-token',
        tokenHash: 'b'.repeat(64),
        expiresAt: new Date('2026-08-13T00:00:00Z'),
      }),
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    };
    service = new UserService(authService as unknown as AuthService);
    jest.restoreAllMocks();
    // Escalation gate (ISSUE-3) resolves target roles via prisma.role.findMany.
    // Default: the role carries no permissions, i.e. always a subset -> allowed.
    // Individual tests override this to model a privileged target role.
    jest.spyOn(prisma.role, 'findMany').mockResolvedValue([] as never);
  });

  // ==========================================
  // Tenant isolation
  // ==========================================

  it('refuses every operation when no tenant context is present', async () => {
    await expect(service.findAll(null)).rejects.toThrow(ForbiddenException);
    await expect(service.findOne(USER_ID, null)).rejects.toThrow(ForbiddenException);
    await expect(service.updateUser(USER_ID, {}, null, OWNER_ACTOR)).rejects.toThrow(ForbiddenException);
    await expect(service.deleteUser(USER_ID, null, OWNER_ACTOR)).rejects.toThrow(ForbiddenException);
  });

  it('scopes findOne to the caller tenant and 404s a foreign id (no existence leak)', async () => {
    const findFirst = jest
      .spyOn(prisma.user, 'findFirst')
      .mockResolvedValue(null as never);

    await expect(service.findOne(USER_ID, TENANT_A)).rejects.toThrow(NotFoundException);

    // The tenant predicate must be part of the query, not applied afterwards.
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: USER_ID, tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('excludes soft-deleted users from list results', async () => {
    const findMany = jest.spyOn(prisma.user, 'findMany').mockResolvedValue([] as never);

    await service.findAll(TENANT_A);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  // ==========================================
  // Secret hygiene
  // ==========================================

  it('never exposes passwordHash or mfaSecret in a response', async () => {
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(baseUserRow as never);

    const result = await service.findOne(USER_ID, TENANT_A);

    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('mfaSecret');
    expect(JSON.stringify(result)).not.toContain('super-secret-totp');
    expect(result.roles).toEqual(['CASHIER']);
    expect(result.branchIds).toEqual([BRANCH_A]);
  });

  // ==========================================
  // Create
  // ==========================================

  it('hashes the password with Argon2id and never persists the plaintext', async () => {
    const created = { ...baseUserRow };
    const txc = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created),
      },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      branch: { findMany: jest.fn().mockResolvedValue([]) },
    };
    jest
      .spyOn(prisma, '$transaction')
      .mockImplementation(async (cb: unknown) => (cb as (t: unknown) => Promise<unknown>)(txc));
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(created as never);

    await service.createUser(
      {
        firstName: 'Sara',
        lastName: 'Khan',
        email: 'Sara@Albaik.com',
        password: 'PlaintextPass1!',
      },
      TENANT_A,
      OWNER_ACTOR,
    );

    expect(authService.hashPassword).toHaveBeenCalledWith('PlaintextPass1!');
    const createArgs = txc.user.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(createArgs.data.passwordHash).toBe('argon2-hash');
    expect(createArgs.data).not.toHaveProperty('password');
    // Email is normalised to lowercase so login (which lowercases) matches.
    expect(createArgs.data.email).toBe('sara@albaik.com');
    // Tenant comes from the verified context, never the payload.
    expect(createArgs.data.tenantId).toBe(TENANT_A);
    // AUDIT-005: only the verification token HASH + expiry are stored...
    expect(createArgs.data.emailVerificationTokenHash).toBe('b'.repeat(64));
    expect(createArgs.data.emailVerificationTokenExpiry).toEqual(new Date('2026-08-13T00:00:00Z'));
    expect(createArgs.data).not.toHaveProperty('emailVerificationTokenHash', 'raw-verify-token');
    // ...and the verification email is dispatched fire-and-forget afterwards.
    expect(authService.sendVerificationEmail).toHaveBeenCalledWith(
      'sara@albaik.com',
      'Sara',
      'raw-verify-token',
      TENANT_A,
    );
  });

  it('rejects a duplicate email within the tenant with 409', async () => {
    const txc = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'existing' }), create: jest.fn() },
      role: { findMany: jest.fn() },
      branch: { findMany: jest.fn() },
    };
    jest
      .spyOn(prisma, '$transaction')
      .mockImplementation(async (cb: unknown) => (cb as (t: unknown) => Promise<unknown>)(txc));

    await expect(
      service.createUser(
      { firstName: 'A', lastName: 'B', email: 'dup@albaik.com', password: 'Password1!' },
        TENANT_A,
        OWNER_ACTOR,
      ),
    ).rejects.toThrow(ConflictException);

    expect(txc.user.create).not.toHaveBeenCalled();
  });

  // ==========================================
  // Branch isolation (DOC-005 §4.2)
  // ==========================================

  it('rejects a branch belonging to another tenant instead of silently ignoring it', async () => {
    const txc = {
      user: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      // Foreign branch is not returned by the tenant-scoped lookup.
      branch: { findMany: jest.fn().mockResolvedValue([]) },
    };
    jest
      .spyOn(prisma, '$transaction')
      .mockImplementation(async (cb: unknown) => (cb as (t: unknown) => Promise<unknown>)(txc));

    await expect(
      service.createUser(
      {
          firstName: 'A',
          lastName: 'B',
          email: 'x@albaik.com',
          password: 'Password1!',
          branchIds: [BRANCH_FOREIGN],
        },
        TENANT_A,
        OWNER_ACTOR,
      ),
    ).rejects.toThrow(BadRequestException);

    // The branch lookup itself must be tenant-scoped.
    expect(txc.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A }),
      }),
    );
    expect(txc.user.create).not.toHaveBeenCalled();
  });

  it('writes branch assignments carrying the tenant id', async () => {
    const txc = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(baseUserRow),
      },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      branch: { findMany: jest.fn().mockResolvedValue([{ id: BRANCH_A }]) },
    };
    jest
      .spyOn(prisma, '$transaction')
      .mockImplementation(async (cb: unknown) => (cb as (t: unknown) => Promise<unknown>)(txc));
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(baseUserRow as never);

    await service.createUser(
      {
        firstName: 'A',
        lastName: 'B',
        email: 'x@albaik.com',
        password: 'Password1!',
        branchIds: [BRANCH_A],
      },
      TENANT_A,
      OWNER_ACTOR,
    );

    // Nested write under the tenant-scoped User create (see service comment:
    // the tenant extension would otherwise inject tenantId into join-table creates).
    const createArgs = txc.user.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(createArgs.data.userBranches).toEqual({
      create: [{ branchId: BRANCH_A, tenantId: TENANT_A }],
    });
  });

  // ==========================================
  // Roles
  // ==========================================

  it('rejects an unknown role name rather than provisioning a powerless user', async () => {
    const txc = {
      user: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      role: { findMany: jest.fn().mockResolvedValue([]) }, // nothing matched
      branch: { findMany: jest.fn().mockResolvedValue([]) },
    };
    jest
      .spyOn(prisma, '$transaction')
      .mockImplementation(async (cb: unknown) => (cb as (t: unknown) => Promise<unknown>)(txc));

    await expect(
      service.createUser(
      {
          firstName: 'A',
          lastName: 'B',
          email: 'x@albaik.com',
          password: 'Password1!',
          roles: ['WIZARD'],
        },
        TENANT_A,
        // Actor holds WIZARD, so the escalation gate passes and we reach the
        // role-resolution step this test is about.
        { id: OWNER_ACTOR.id, roles: ['RESTAURANT_OWNER', 'WIZARD'], permissions: OWNER_ACTOR.permissions },
      ),
    ).rejects.toThrow(BadRequestException);

    expect(txc.user.create).not.toHaveBeenCalled();
  });

  it('resolves role names only within the caller tenant', async () => {
    const txc = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(baseUserRow),
      },
      role: { findMany: jest.fn().mockResolvedValue([{ id: 'role-1', name: 'CASHIER' }]) },
      branch: { findMany: jest.fn().mockResolvedValue([]) },
    };
    jest
      .spyOn(prisma, '$transaction')
      .mockImplementation(async (cb: unknown) => (cb as (t: unknown) => Promise<unknown>)(txc));
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(baseUserRow as never);

    await service.createUser(
      {
        firstName: 'A',
        lastName: 'B',
        email: 'x@albaik.com',
        password: 'Password1!',
        roles: ['CASHIER'],
      },
      TENANT_A,
      OWNER_ACTOR,
    );

    expect(txc.role.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A }),
      }),
    );
    const roleCreateArgs = txc.user.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(roleCreateArgs.data.userRoles).toEqual({ create: [{ roleId: 'role-1' }] });
  });

  // ==========================================
  // Update
  // ==========================================

  it('leaves roles and branches untouched when the keys are omitted', async () => {
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(baseUserRow as never);
    const txc = {
      user: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      role: { findMany: jest.fn() },
      branch: { findMany: jest.fn() },
    };
    jest
      .spyOn(prisma, '$transaction')
      .mockImplementation(async (cb: unknown) => (cb as (t: unknown) => Promise<unknown>)(txc));

    await service.updateUser(USER_ID, { firstName: 'Renamed' }, TENANT_A, OWNER_ACTOR);

    expect(txc.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { firstName: 'Renamed' },
    });
    // No role/branch resolution happens when the keys are absent.
    expect(txc.role.findMany).not.toHaveBeenCalled();
    expect(txc.branch.findMany).not.toHaveBeenCalled();
  });

  it('does not allow mfaEnabled/mfaSecret/tenantId to be changed through update', async () => {
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(baseUserRow as never);
    const txc = {
      user: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      role: { findMany: jest.fn() },
      branch: { findMany: jest.fn() },
    };
    jest
      .spyOn(prisma, '$transaction')
      .mockImplementation(async (cb: unknown) => (cb as (t: unknown) => Promise<unknown>)(txc));

    await service.updateUser(
      USER_ID,
      { firstName: 'X', mfaEnabled: true, tenantId: 'other' } as never,
      TENANT_A,
      OWNER_ACTOR,
    );

    const data = txc.user.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).not.toHaveProperty('mfaEnabled');
    expect(data).not.toHaveProperty('mfaSecret');
    expect(data).not.toHaveProperty('tenantId');
  });

  it('replaces the role set, removing roles absent from the payload', async () => {
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(baseUserRow as never);
    const txc = {
      user: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      role: {
        findMany: jest
          .fn()
          // 1st call resolves the DESIRED role names -> MANAGER
          .mockResolvedValueOnce([{ id: 'role-2', name: 'MANAGER' }])
          // 2nd call resolves the CURRENT role names (from findOne) -> CASHIER
          .mockResolvedValueOnce([{ id: 'role-1', name: 'CASHIER' }]),
      },
      branch: { findMany: jest.fn() },
    };
    jest
      .spyOn(prisma, '$transaction')
      .mockImplementation(async (cb: unknown) => (cb as (t: unknown) => Promise<unknown>)(txc));

    await service.assignRoles(USER_ID, ['MANAGER'], TENANT_A, OWNER_ACTOR);

    // Replacement is expressed as a nested deleteMany+create on the
    // tenant-scoped User update.
    const nested = txc.user.update.mock.calls.find(
      (c: unknown[]) => (c[0] as { data: Record<string, unknown> }).data.userRoles,
    );
    expect(nested).toBeDefined();
    const userRoles = (nested![0] as { data: { userRoles: Record<string, unknown> } }).data
      .userRoles;
    expect(userRoles.deleteMany).toEqual([{ roleId: 'role-1' }]);
    expect(userRoles.create).toEqual([{ roleId: 'role-2' }]);
  });

  it('rejects an email that collides with another user in the same tenant', async () => {
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(baseUserRow as never);
    const txc = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'someone-else' }),
        update: jest.fn(),
      },
      role: { findMany: jest.fn() },
      branch: { findMany: jest.fn() },
    };
    jest
      .spyOn(prisma, '$transaction')
      .mockImplementation(async (cb: unknown) => (cb as (t: unknown) => Promise<unknown>)(txc));

    await expect(
      service.updateUser(USER_ID, { email: 'taken@albaik.com' }, TENANT_A, OWNER_ACTOR),
    ).rejects.toThrow(ConflictException);
    expect(txc.user.update).not.toHaveBeenCalled();
  });

  // ==========================================
  // Delete
  // ==========================================

  it('soft-deletes and deactivates rather than hard-deleting', async () => {
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(baseUserRow as never);
    const txc = makeTx();
    jest
      .spyOn(prisma, '$transaction')
      .mockImplementation(async (cb: unknown) => (cb as (t: unknown) => Promise<unknown>)(txc));

    const result = await service.deleteUser(USER_ID, TENANT_A, OWNER_ACTOR);

    expect(result).toEqual({ id: USER_ID, deleted: true });
    const update = (txc.user as { update: jest.Mock }).update;
    const args = update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(args.data.deletedAt).toBeInstanceOf(Date);
    expect(args.data.isActive).toBe(false);
  });

  it('refuses self-deletion so a tenant cannot be stranded without an admin', async () => {
    const update = jest.spyOn(prisma.user, 'update');

    await expect(service.deleteUser(USER_ID, TENANT_A, { id: USER_ID, roles: ['RESTAURANT_OWNER'], permissions: OWNER_ACTOR.permissions })).rejects.toThrow(
      BadRequestException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('404s when deleting a user from another tenant', async () => {
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(null as never);
    const update = jest.spyOn(prisma.user, 'update');

    await expect(service.deleteUser(USER_ID, TENANT_A, OWNER_ACTOR)).rejects.toThrow(
      NotFoundException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  // ==========================================
  // Architecture review fixes
  // ==========================================

  describe('ISSUE-3 — privilege escalation gate', () => {
    it('refuses to grant a role the actor does not hold (self-escalation)', async () => {
      const manager = { id: 'mgr-1', roles: ['MANAGER'], permissions: ['order:read', 'menu:read'] };

      jest.spyOn(prisma.role, 'findMany').mockResolvedValue([
        {
          name: 'RESTAURANT_OWNER',
          rolePermissions: [
            { permission: { resource: 'user', action: 'delete' } },
            { permission: { resource: 'tenant', action: 'update' } },
          ],
        },
      ] as never);

      await expect(
        service.updateUser(USER_ID, { roles: ['RESTAURANT_OWNER'] }, TENANT_A, manager),
      ).rejects.toThrow(ForbiddenException);

      // Rejected before any hashing or DB mutation.
      expect(authService.hashPassword).not.toHaveBeenCalled();
    });

    it('refuses escalation at CREATE time before hashing the password', async () => {
      const manager = { id: 'mgr-1', roles: ['MANAGER'], permissions: ['order:read', 'menu:read'] };
      jest.spyOn(prisma.role, 'findMany').mockResolvedValue([
        {
          name: 'RESTAURANT_OWNER',
          rolePermissions: [{ permission: { resource: 'tenant', action: 'update' } }],
        },
      ] as never);
      const tx = jest.spyOn(prisma, '$transaction');

      await expect(
        service.createUser(
          {
            firstName: 'A',
            lastName: 'B',
            email: 'esc@albaik.com',
            password: 'Password1!',
            roles: ['RESTAURANT_OWNER'],
          },
          TENANT_A,
          manager,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(authService.hashPassword).not.toHaveBeenCalled();
      expect(tx).not.toHaveBeenCalled();
    });

    it('never allows PLATFORM_OWNER to be granted from the tenant surface', async () => {
      const owner = { id: 'own-1', roles: ['RESTAURANT_OWNER'], permissions: OWNER_ACTOR.permissions };

      await expect(
        service.updateUser(USER_ID, { roles: ['PLATFORM_OWNER'] }, TENANT_A, owner),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows granting a role the actor already holds', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(baseUserRow as never);
      jest.spyOn(prisma.user, 'count').mockResolvedValue(1 as never);
      const txc = {
        user: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
        role: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([{ id: 'role-1', name: 'CASHIER' }])
            .mockResolvedValueOnce([{ id: 'role-1', name: 'CASHIER' }]),
        },
        branch: { findMany: jest.fn() },
      };
      jest
        .spyOn(prisma, '$transaction')
        .mockImplementation(async (cb: unknown) => (cb as (t: unknown) => Promise<unknown>)(txc));

      await expect(
        service.updateUser(USER_ID, { roles: ['CASHIER'] }, TENANT_A, OWNER_ACTOR),
      ).resolves.toBeDefined();
    });
  });

  describe('ISSUE-1/2 — token revocation on account-state change', () => {
    it('revokes all tokens when a user is soft-deleted', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(baseUserRow as never);
      const txc = makeTx();
      jest
        .spyOn(prisma, '$transaction')
        .mockImplementation(async (cb: unknown) => (cb as (t: unknown) => Promise<unknown>)(txc));

      await service.deleteUser(USER_ID, TENANT_A, OWNER_ACTOR);

      expect(authService.revokeAllUserTokens).toHaveBeenCalledWith(USER_ID);
    });

    it('revokes all tokens when a user is deactivated', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(baseUserRow as never);
      jest.spyOn(prisma.user, 'count').mockResolvedValue(1 as never);
      const txc = {
        user: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
        role: { findMany: jest.fn() },
        branch: { findMany: jest.fn() },
      };
      jest
        .spyOn(prisma, '$transaction')
        .mockImplementation(async (cb: unknown) => (cb as (t: unknown) => Promise<unknown>)(txc));

      await service.updateUser(USER_ID, { isActive: false }, TENANT_A, OWNER_ACTOR);

      expect(authService.revokeAllUserTokens).toHaveBeenCalledWith(USER_ID);
    });

    it('revokes all tokens when the password is rotated (stale sessions)', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(baseUserRow as never);
      const txc = {
        user: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
        role: { findMany: jest.fn() },
        branch: { findMany: jest.fn() },
      };
      jest
        .spyOn(prisma, '$transaction')
        .mockImplementation(async (cb: unknown) => (cb as (t: unknown) => Promise<unknown>)(txc));

      await service.updateUser(USER_ID, { password: 'NewPassword1!' }, TENANT_A, OWNER_ACTOR);

      expect(authService.revokeAllUserTokens).toHaveBeenCalledWith(USER_ID);
    });

    it('does NOT revoke tokens for a benign profile edit', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(baseUserRow as never);
      const txc = {
        user: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
        role: { findMany: jest.fn() },
        branch: { findMany: jest.fn() },
      };
      jest
        .spyOn(prisma, '$transaction')
        .mockImplementation(async (cb: unknown) => (cb as (t: unknown) => Promise<unknown>)(txc));

      await service.updateUser(USER_ID, { firstName: 'Renamed' }, TENANT_A, OWNER_ACTOR);

      expect(authService.revokeAllUserTokens).not.toHaveBeenCalled();
    });
  });

  describe('ISSUE-4 — last-owner lockout protection (race-safe)', () => {
    const ownerRow = {
      ...baseUserRow,
      userRoles: [{ role: { id: 'role-o', name: 'RESTAURANT_OWNER' } }],
    };

    it('takes a per-tenant advisory lock before counting owners', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(ownerRow as never);
      const txc = makeTx({
        user: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
          update: jest.fn(),
          count: jest.fn().mockResolvedValue(1),
        },
      });
      jest
        .spyOn(prisma, '$transaction')
        .mockImplementation(async (cb: unknown) => (cb as (t: unknown) => Promise<unknown>)(txc));

      await service.deleteUser(USER_ID, TENANT_A, OWNER_ACTOR);

      // Lock must be acquired, and acquired BEFORE the count (TOCTOU fix).
      const lock = txc.$executeRaw as jest.Mock;
      const count = (txc.user as { count: jest.Mock }).count;
      expect(lock).toHaveBeenCalled();
      expect(lock.mock.invocationCallOrder[0]).toBeLessThan(count.mock.invocationCallOrder[0]);
    });

    it('refuses to delete the last active owner', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(ownerRow as never);
      const txc = makeTx({
        user: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
          update: jest.fn(),
          count: jest.fn().mockResolvedValue(0), // no other owner
        },
      });
      jest
        .spyOn(prisma, '$transaction')
        .mockImplementation(async (cb: unknown) => (cb as (t: unknown) => Promise<unknown>)(txc));

      await expect(service.deleteUser(USER_ID, TENANT_A, OWNER_ACTOR)).rejects.toThrow(
        BadRequestException,
      );
      expect((txc.user as { update: jest.Mock }).update).not.toHaveBeenCalled();
    });

    it('allows deleting an owner when another active owner remains', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(ownerRow as never);
      const txc = makeTx();
      jest
        .spyOn(prisma, '$transaction')
        .mockImplementation(async (cb: unknown) => (cb as (t: unknown) => Promise<unknown>)(txc));

      await expect(service.deleteUser(USER_ID, TENANT_A, OWNER_ACTOR)).resolves.toEqual({
        id: USER_ID,
        deleted: true,
      });
      expect((txc.user as { update: jest.Mock }).update).toHaveBeenCalled();
    });

    it('refuses to deactivate the last active owner', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(ownerRow as never);
      const txc = makeTx({
        user: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
          update: jest.fn(),
          count: jest.fn().mockResolvedValue(0),
        },
      });
      jest
        .spyOn(prisma, '$transaction')
        .mockImplementation(async (cb: unknown) => (cb as (t: unknown) => Promise<unknown>)(txc));

      await expect(
        service.updateUser(USER_ID, { isActive: false }, TENANT_A, OWNER_ACTOR),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses to strip RESTAURANT_OWNER from the last active owner', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(ownerRow as never);
      const txc = makeTx({
        user: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
          update: jest.fn(),
          count: jest.fn().mockResolvedValue(0),
        },
      });
      jest
        .spyOn(prisma, '$transaction')
        .mockImplementation(async (cb: unknown) => (cb as (t: unknown) => Promise<unknown>)(txc));

      await expect(
        service.updateUser(USER_ID, { roles: ['CASHIER'] }, TENANT_A, OWNER_ACTOR),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('ISSUE-5 — soft-deleted branches excluded from scope', () => {
    it('filters userBranches to live branches on read', async () => {
      const findFirst = jest
        .spyOn(prisma.user, 'findFirst')
        .mockResolvedValue(baseUserRow as never);

      await service.findOne(USER_ID, TENANT_A);

      const args = findFirst.mock.calls[0][0] as {
        include: { userBranches: { where: Record<string, unknown> } };
      };
      expect(args.include.userBranches.where).toEqual({ branch: { deletedAt: null } });
    });
  });

  describe('pagination (scalability)', () => {
    it('applies a default page size and a deterministic total order', async () => {
      const findMany = jest.spyOn(prisma.user, 'findMany').mockResolvedValue([] as never);

      await service.findAll(TENANT_A);

      const args = findMany.mock.calls[0][0] as Record<string, unknown>;
      expect(args.take).toBe(100);
      expect(args.skip).toBe(0);
      // createdAt alone is not unique; id is the tiebreaker so pages cannot
      // repeat or skip rows.
      expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    });

    it('clamps an oversized limit to MAX_PAGE_SIZE', async () => {
      const findMany = jest.spyOn(prisma.user, 'findMany').mockResolvedValue([] as never);

      await service.findAll(TENANT_A, { limit: 99999 });

      expect((findMany.mock.calls[0][0] as Record<string, unknown>).take).toBe(200);
    });

    it('rejects non-positive limits and negative offsets', async () => {
      const findMany = jest.spyOn(prisma.user, 'findMany').mockResolvedValue([] as never);

      await service.findAll(TENANT_A, { limit: 0, offset: -50 });

      const args = findMany.mock.calls[0][0] as Record<string, unknown>;
      expect(args.take).toBe(1);
      expect(args.skip).toBe(0);
    });

    it('passes through a valid limit/offset window', async () => {
      const findMany = jest.spyOn(prisma.user, 'findMany').mockResolvedValue([] as never);

      await service.findAll(TENANT_A, { limit: 25, offset: 50 });

      const args = findMany.mock.calls[0][0] as Record<string, unknown>;
      expect(args.take).toBe(25);
      expect(args.skip).toBe(50);
    });
  });

  describe('fail-closed when the session store is unavailable', () => {
    it('rolls back the soft delete if token revocation cannot be persisted', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(baseUserRow as never);
      // Redis down -> revokeAllUserTokens throws ServiceUnavailableException.
      authService.revokeAllUserTokens.mockRejectedValue(
        new ServiceUnavailableException('Unable to revoke active sessions right now.'),
      );

      const txc = makeTx();
      // Real $transaction semantics: a throw inside the callback aborts.
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: unknown) => {
        return (cb as (t: unknown) => Promise<unknown>)(txc);
      });

      await expect(service.deleteUser(USER_ID, TENANT_A, OWNER_ACTOR)).rejects.toThrow(
        ServiceUnavailableException,
      );

      // The delete was attempted inside the same transaction that then threw,
      // so Prisma aborts it — the user is NOT left deleted-but-still-authorised.
      expect(authService.revokeAllUserTokens).toHaveBeenCalledWith(USER_ID);
    });

    it('rolls back a deactivation if token revocation cannot be persisted', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(baseUserRow as never);
      authService.revokeAllUserTokens.mockRejectedValue(
        new ServiceUnavailableException('Unable to revoke active sessions right now.'),
      );

      const txc = makeTx();
      jest
        .spyOn(prisma, '$transaction')
        .mockImplementation(async (cb: unknown) => (cb as (t: unknown) => Promise<unknown>)(txc));

      await expect(
        service.updateUser(USER_ID, { isActive: false }, TENANT_A, OWNER_ACTOR),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('does not attempt revocation for a benign profile edit', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(baseUserRow as never);
      const txc = makeTx();
      jest
        .spyOn(prisma, '$transaction')
        .mockImplementation(async (cb: unknown) => (cb as (t: unknown) => Promise<unknown>)(txc));

      await service.updateUser(USER_ID, { firstName: 'Renamed' }, TENANT_A, OWNER_ACTOR);

      expect(authService.revokeAllUserTokens).not.toHaveBeenCalled();
    });
  });
});
