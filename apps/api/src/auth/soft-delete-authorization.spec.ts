import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { NotFoundException, ExecutionContext } from '@nestjs/common';
import { RbacPermissionGuard } from './guards/rbac-permission.guard';
import { CaslAbilityFactory } from './casl-ability.factory';
import { INCLUDE_SOFT_DELETED_KEY } from './decorators/include-soft-deleted.decorator';
import { REQUIRE_PERMISSION_KEY } from './decorators/require-permission.decorator';

/**
 * AUDIT-006/007 — authorization behaviour around soft-deleted records.
 *
 * DEFECT-E (found by runtime verification of this very feature): the guard
 * re-resolves the `:id` path parameter through `repository.findById`, which
 * applies the `deletedAt IS NULL` filter. That made every restore endpoint
 * unreachable — `POST /api/v1/menu/products/:id/restore` returned 404 while the
 * row was present in Postgres with `deletedAt` set, even for an owner holding
 * `product:update`.
 *
 * The fix is the `@IncludeSoftDeleted()` decorator, which switches that single
 * lookup to `findByIdIncludingDeleted`. These tests pin both halves: ordinary
 * routes must keep hiding deleted rows, restore routes must see them, and
 * neither may widen tenant scope.
 */

const LIVE_ID = '48bcd555-9585-481e-8c31-ca87701005aa';
const DELETED_ID = '33daa1a8-841a-4f4f-8477-61e35863fb8b';

const liveRow = { id: LIVE_ID, tenantId: 't1', deletedAt: null };
const deletedRow = { id: DELETED_ID, tenantId: 't1', deletedAt: new Date() };

const findById = jest.fn(async (id: string) => (id === LIVE_ID ? liveRow : null));
const findByIdIncludingDeleted = jest.fn(async (id: string) =>
  id === LIVE_ID ? liveRow : id === DELETED_ID ? deletedRow : null,
);

jest.mock('@zayjar/db', () => {
  class Repo {
    findById = (id: string): Promise<unknown> => findById(id);
    findByIdIncludingDeleted = (id: string): Promise<unknown> => findByIdIncludingDeleted(id);
  }
  return {
    TenantProductRepository: Repo,
    TenantCategoryRepository: Repo,
    // AUDIT-014: `Customer` joined the guard's registry, which is instantiated
    // at module load — the mock must supply it or the suite cannot import.
    TenantCustomerRepository: Repo,
    TenantOrderRepository: Repo,
    TenantBranchRepository: Repo,
    TenantRestaurantRepository: Repo,
    TenantUserRepository: Repo,
    TenantTableRepository: Repo,
    prisma: { tenant: { findUnique: jest.fn() } },
  };
});

function buildContext(opts: {
  id: string;
  action: string;
  resource: string;
  includeSoftDeleted?: boolean;
  permissions?: string[];
}): { context: ExecutionContext; reflector: Reflector } {
  const handler = (): void => undefined;
  const cls = class Controller {};

  const reflector = {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === INCLUDE_SOFT_DELETED_KEY) {
        return opts.includeSoftDeleted ?? false;
      }
      return false; // IS_PUBLIC_KEY
    }),
    get: jest.fn((key: string) =>
      key === REQUIRE_PERMISSION_KEY ? { action: opts.action, resource: opts.resource } : undefined,
    ),
  } as unknown as Reflector;

  const context = {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({
      getRequest: () => ({
        params: { id: opts.id },
        body: {},
        user: {
          id: 'u1',
          email: 'owner@example.com',
          tenantId: 't1',
          roles: ['RESTAURANT_OWNER'],
          permissions: opts.permissions ?? [
            'product:update',
            'product:delete',
            'category:update',
            'branch:update',
            'table:update',
          ],
        },
      }),
    }),
  } as unknown as ExecutionContext;

  return { context, reflector };
}

describe('RbacPermissionGuard — soft-deleted record resolution (DEFECT-E)', () => {
  beforeEach(() => {
    findById.mockClear();
    findByIdIncludingDeleted.mockClear();
  });

  it('hides soft-deleted rows from ordinary routes (404)', async () => {
    const { context, reflector } = buildContext({
      id: DELETED_ID,
      action: 'update',
      resource: 'Product',
    });
    const guard = new RbacPermissionGuard(reflector, new CaslAbilityFactory());

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(NotFoundException);
    expect(findById).toHaveBeenCalledWith(DELETED_ID);
    expect(findByIdIncludingDeleted).not.toHaveBeenCalled();
  });

  it('resolves soft-deleted rows on @IncludeSoftDeleted() routes', async () => {
    const { context, reflector } = buildContext({
      id: DELETED_ID,
      action: 'update',
      resource: 'Product',
      includeSoftDeleted: true,
    });
    const guard = new RbacPermissionGuard(reflector, new CaslAbilityFactory());

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findByIdIncludingDeleted).toHaveBeenCalledWith(DELETED_ID);
    expect(findById).not.toHaveBeenCalled();
  });

  it('still 404s an unknown id even with the widened lookup', async () => {
    const { context, reflector } = buildContext({
      id: '11111111-1111-4111-8111-111111111111',
      action: 'update',
      resource: 'Product',
      includeSoftDeleted: true,
    });
    const guard = new RbacPermissionGuard(reflector, new CaslAbilityFactory());
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a malformed id before any database call', async () => {
    const { context, reflector } = buildContext({
      id: 'NOT-A-UUID',
      action: 'update',
      resource: 'Product',
      includeSoftDeleted: true,
    });
    const guard = new RbacPermissionGuard(reflector, new CaslAbilityFactory());

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(NotFoundException);
    expect(findById).not.toHaveBeenCalled();
    expect(findByIdIncludingDeleted).not.toHaveBeenCalled();
  });

  it('still enforces the ability on a restore route (403 without permission)', async () => {
    const { context, reflector } = buildContext({
      id: DELETED_ID,
      action: 'update',
      resource: 'Product',
      includeSoftDeleted: true,
      permissions: ['product:read'],
    });
    const guard = new RbacPermissionGuard(reflector, new CaslAbilityFactory());
    await expect(guard.canActivate(context)).rejects.toThrow(/Access Denied/);
  });
});

describe('CaslAbilityFactory — Category subject (AUDIT-006)', () => {
  const factory = new CaslAbilityFactory();

  it('grants category actions from the token permission strings', () => {
    const ability = factory.createForUser({
      id: 'u1',
      email: 'o@e.com',
      tenantId: 't1',
      roles: ['RESTAURANT_OWNER'],
      permissions: ['category:update', 'category:delete'],
    });
    expect(ability.can('update', 'Category')).toBe(true);
    expect(ability.can('delete', 'Category')).toBe(true);
  });

  it('denies category actions that were not granted', () => {
    const ability = factory.createForUser({
      id: 'u1',
      email: 'c@e.com',
      tenantId: 't1',
      roles: ['CASHIER'],
      permissions: ['product:read'],
    });
    expect(ability.can('delete', 'Category')).toBe(false);
    expect(ability.can('update', 'Category')).toBe(false);
  });
});
