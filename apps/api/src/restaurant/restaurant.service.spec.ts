import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RestaurantService } from './restaurant.service';
import { RestaurantController } from './restaurant.controller';
import { REQUIRE_PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';

/**
 * AUDIT-014 DEFECT-L regression.
 *
 * `POST /api/v1/menu/categories` and `POST /api/v1/branches` both require a
 * `restaurantId`, but no endpoint exposed one. Runtime-proven before the fix:
 *
 *   GET  /api/v1/restaurants      -> HTTP 404 (route did not exist)
 *   POST /api/v1/menu/categories  -> HTTP 400 ["restaurantId should not be empty"]
 *
 * so the Backoffice could not create a category or a branch at all.
 */

const repoState: { list: unknown[]; one: unknown | null } = { list: [], one: null };
const seen: { findManyArgs: unknown[][] } = { findManyArgs: [] };

jest.mock('@zayjar/db', () => {
  class TenantRestaurantRepository {
    async findMany(...args: unknown[]): Promise<unknown[]> {
      seen.findManyArgs.push(args);
      return repoState.list;
    }
    async findById(): Promise<unknown> {
      return repoState.one;
    }
  }
  class Stub {
    async findById(): Promise<null> {
      return null;
    }
    async findByIdIncludingDeleted(): Promise<null> {
      return null;
    }
  }
  return {
    TenantRestaurantRepository,
    TenantProductRepository: Stub,
    TenantCategoryRepository: Stub,
    TenantCustomerRepository: Stub,
    TenantOrderRepository: Stub,
    TenantBranchRepository: Stub,
    TenantUserRepository: Stub,
    TenantTableRepository: Stub,
    prisma: { tenant: { findUnique: jest.fn() } },
  };
});

const RESTAURANT_ID = 'e0478415-6d1a-4a5f-9c3b-2f8a1d4e7b90';

describe('RestaurantService (AUDIT-014 DEFECT-L)', () => {
  let service: RestaurantService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RestaurantService],
    }).compile();
    service = module.get<RestaurantService>(RestaurantService);
    repoState.list = [{ id: RESTAURANT_ID, name: 'Al-Baik Chicken' }];
    repoState.one = { id: RESTAURANT_ID, name: 'Al-Baik Chicken' };
    seen.findManyArgs = [];
  });

  it('lists the tenant brands ordered by name', async () => {
    const result = await service.findAll();
    expect(result).toHaveLength(1);
    expect(seen.findManyArgs[0][1]).toEqual({ orderBy: { name: 'asc' } });
  });

  it('hides soft-deleted brands by default', async () => {
    await service.findAll();
    expect(seen.findManyArgs[0][0]).toEqual({});
  });

  it('surfaces soft-deleted brands when includeDeleted is set', async () => {
    await service.findAll(true);
    // `deletedAt: undefined` suppresses the filter in scopedWhere.
    expect(seen.findManyArgs[0][0]).toEqual({ deletedAt: undefined });
  });

  it('returns a single brand', async () => {
    await expect(service.findOne(RESTAURANT_ID)).resolves.toMatchObject({ id: RESTAURANT_ID });
  });

  it('404s for an unknown or cross-tenant brand', async () => {
    repoState.one = null;
    await expect(service.findOne(RESTAURANT_ID)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('RestaurantController authorization metadata', () => {
  it('is guarded by JwtAuthGuard + RbacPermissionGuard', () => {
    const guards = Reflect.getMetadata('__guards__', RestaurantController);
    expect(guards.map((g: { name: string }) => g.name)).toEqual(
      expect.arrayContaining(['JwtAuthGuard', 'RbacPermissionGuard']),
    );
  });

  it.each(['findAll', 'findOne'])('%s requires read on the Restaurant subject', (method) => {
    // Must be `Restaurant`, not `Branch`: RbacPermissionGuard re-resolves `:id`
    // against the repository registered for the subject, so a Branch-guarded
    // /restaurants/:id searched the BRANCHES table and 404'd a valid brand.
    const meta = Reflect.getMetadata(
      REQUIRE_PERMISSION_KEY,
      RestaurantController.prototype[method as keyof typeof RestaurantController.prototype],
    );
    expect(meta).toEqual({ action: 'read', resource: 'Restaurant' });
  });
});
