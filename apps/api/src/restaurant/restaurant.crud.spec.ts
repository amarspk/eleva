import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RestaurantService } from './restaurant.service';
import { RestaurantController } from './restaurant.controller';
import { CreateRestaurantRequestDto } from './dto/create-restaurant-request.dto';
import { UpdateRestaurantRequestDto } from './dto/update-restaurant-request.dto';
import { SubscriptionService } from '../subscription/subscription.service';
import { REQUIRE_PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';

/**
 * AUDIT-008 — restaurant write management.
 *
 * Proven missing before this work: RestaurantController only had GET list/get;
 * seed only granted restaurant:read.
 */

const repoState: {
  one: Record<string, unknown> | null;
  includingDeleted: Record<string, unknown> | null;
  created: Record<string, unknown> | null;
  liveBranches: number;
} = { one: null, includingDeleted: null, created: null, liveBranches: 0 };

const calls: { create: unknown[][]; update: unknown[][]; softDelete: unknown[][]; restore: unknown[][] } = {
  create: [],
  update: [],
  softDelete: [],
  restore: [],
};

jest.mock('@zayjar/db', () => {
  class Stub {
    async findById(): Promise<null> {
      return null;
    }
    async findByIdIncludingDeleted(): Promise<null> {
      return null;
    }
  }
  class TenantRestaurantRepository {
    async findById(): Promise<unknown> {
      return repoState.one;
    }
    async findByIdIncludingDeleted(): Promise<unknown> {
      return repoState.includingDeleted;
    }
    async findMany(): Promise<unknown[]> {
      return repoState.one ? [repoState.one] : [];
    }
    async create(...args: unknown[]): Promise<unknown> {
      calls.create.push(args);
      return { id: 'new-id', ...(args[0] as object) };
    }
    async update(...args: unknown[]): Promise<unknown> {
      calls.update.push(args);
      return { ...(repoState.one as object), ...(args[1] as object) };
    }
    async softDelete(...args: unknown[]): Promise<unknown> {
      calls.softDelete.push(args);
      return repoState.one;
    }
    async restore(...args: unknown[]): Promise<unknown> {
      calls.restore.push(args);
      return repoState.includingDeleted;
    }
  }
  class TenantBranchRepository {
    async count(): Promise<number> {
      return repoState.liveBranches;
    }
  }
  return {
    TenantRestaurantRepository,
    TenantBranchRepository,
    TenantProductRepository: Stub,
    TenantCategoryRepository: Stub,
    TenantCustomerRepository: Stub,
    TenantOrderRepository: Stub,
    TenantUserRepository: Stub,
    TenantTableRepository: Stub,
    prisma: { tenant: { findUnique: jest.fn() } },
  };
});

const RESTAURANT_ID = 'e0478415-6d1a-4a5f-9c3b-2f8a1d4e7b90';
const TENANT_ID = '80a00898-782c-4a6e-8bad-880e8f4f7977';

describe('RestaurantService — AUDIT-008 writes', () => {
  let service: RestaurantService;
  let subscription: { checkRestaurantLimit: jest.Mock };

  beforeEach(async () => {
    subscription = { checkRestaurantLimit: jest.fn().mockResolvedValue({ currentCount: 0, maxRestaurants: 3 }) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RestaurantService,
        { provide: SubscriptionService, useValue: subscription },
      ],
    }).compile();
    service = module.get(RestaurantService);

    repoState.one = { id: RESTAURANT_ID, tenantId: TENANT_ID, name: 'Al-Baik Chicken', currency: 'SAR', timezone: 'Asia/Riyadh', taxPercentage: 15, deletedAt: null };
    repoState.includingDeleted = repoState.one;
    repoState.liveBranches = 0;
    calls.create = [];
    calls.update = [];
    calls.softDelete = [];
    calls.restore = [];
  });

  describe('create', () => {
    it('creates with schema fields and onboarding defaults', async () => {
      await service.create({ name: 'Second Brand' }, TENANT_ID);
      expect(subscription.checkRestaurantLimit).toHaveBeenCalledWith(TENANT_ID);
      expect(calls.create[0][0]).toEqual({
        name: 'Second Brand',
        currency: 'USD',
        timezone: 'UTC',
        taxPercentage: 0,
      });
    });

    it('persists supplied currency/timezone/tax', async () => {
      await service.create(
        { name: 'Brand', currency: 'SAR', timezone: 'Asia/Riyadh', taxPercentage: 15 },
        TENANT_ID,
      );
      expect(calls.create[0][0]).toMatchObject({ currency: 'SAR', timezone: 'Asia/Riyadh', taxPercentage: 15 });
    });

    it('does not create when the plan restaurant cap is reached', async () => {
      subscription.checkRestaurantLimit.mockRejectedValue(new ForbiddenException('Restaurant limit reached'));
      await expect(service.create({ name: 'Nope' }, TENANT_ID)).rejects.toBeInstanceOf(ForbiddenException);
      expect(calls.create).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('applies only supplied fields', async () => {
      await service.update(RESTAURANT_ID, { name: 'Al-Baik Express' });
      expect(calls.update[0][1]).toEqual({ name: 'Al-Baik Express' });
    });

    it('is a no-op for an empty body', async () => {
      const result = await service.update(RESTAURANT_ID, {});
      expect(calls.update).toHaveLength(0);
      expect(result).toBe(repoState.one);
    });

    it('404s for an unknown / foreign brand', async () => {
      repoState.one = null;
      await expect(service.update(RESTAURANT_ID, { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('soft-deletes when no live branches remain', async () => {
      await expect(service.remove(RESTAURANT_ID)).resolves.toEqual({ id: RESTAURANT_ID, deleted: true });
      expect(calls.softDelete[0][0]).toBe(RESTAURANT_ID);
    });

    it('refuses (409) while live branches exist', async () => {
      repoState.liveBranches = 2;
      await expect(service.remove(RESTAURANT_ID)).rejects.toBeInstanceOf(ConflictException);
      expect(calls.softDelete).toHaveLength(0);
    });

    it('404s for an unknown / foreign brand', async () => {
      repoState.one = null;
      await expect(service.remove(RESTAURANT_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('restore', () => {
    it('restores a soft-deleted brand', async () => {
      repoState.includingDeleted = { ...(repoState.one as object), deletedAt: new Date() };
      await expect(service.restore(RESTAURANT_ID)).resolves.toEqual({ id: RESTAURANT_ID, restored: true });
      expect(calls.restore[0][0]).toBe(RESTAURANT_ID);
    });

    it('404s when nothing matches even including deleted rows', async () => {
      repoState.includingDeleted = null;
      await expect(service.restore(RESTAURANT_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

describe('RestaurantController AUDIT-008 authorization metadata', () => {
  it.each([
    ['create', 'create'],
    ['update', 'update'],
    ['remove', 'delete'],
    ['restore', 'update'],
  ] as const)('%s requires %s on Restaurant', (method, action) => {
    const meta = Reflect.getMetadata(
      REQUIRE_PERMISSION_KEY,
      RestaurantController.prototype[method],
    );
    expect(meta).toEqual({ action, resource: 'Restaurant' });
  });
});

describe('AUDIT-008 restaurant DTO validation', () => {
  it('requires a name on create', async () => {
    const errors = await validate(plainToInstance(CreateRestaurantRequestDto, {}));
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('rejects a tax percentage above 100', async () => {
    const errors = await validate(plainToInstance(CreateRestaurantRequestDto, { name: 'X', taxPercentage: 150 }));
    expect(errors.some((e) => e.property === 'taxPercentage')).toBe(true);
  });

  it('rejects a currency that is not 3 characters', async () => {
    const errors = await validate(plainToInstance(UpdateRestaurantRequestDto, { currency: 'SA' }));
    expect(errors.some((e) => e.property === 'currency')).toBe(true);
  });

  it('does not declare tenantId on either write DTO', () => {
    expect(Object.getOwnPropertyNames(new CreateRestaurantRequestDto())).not.toContain('tenantId');
    expect(Object.getOwnPropertyNames(new UpdateRestaurantRequestDto())).not.toContain('tenantId');
  });
});
