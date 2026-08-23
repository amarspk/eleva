import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { DiscountAdminService } from './discount-admin.service';
import { DiscountController } from './discount.controller';
import { CreateDiscountRequestDto } from './dto/create-discount-request.dto';
import { UpdateDiscountRequestDto } from './dto/update-discount-request.dto';
import { REQUIRE_PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';

const repoState: { one: Record<string, unknown> | null; list: Record<string, unknown>[] } = {
  one: null,
  list: [],
};
const calls: { create: unknown[][]; update: unknown[][]; delete: unknown[][] } = {
  create: [],
  update: [],
  delete: [],
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
  class TenantDiscountRepository {
    async findById(): Promise<unknown> {
      return repoState.one;
    }
    async findMany(where: Record<string, unknown> = {}): Promise<unknown[]> {
      if (where.code) {
        return repoState.list.filter((row) => row.code === where.code);
      }
      return repoState.list;
    }
    async create(...args: unknown[]): Promise<unknown> {
      calls.create.push(args);
      return { id: 'new-disc', ...(args[0] as object) };
    }
    async update(...args: unknown[]): Promise<unknown> {
      calls.update.push(args);
      return { ...(repoState.one as object), ...(args[1] as object) };
    }
    async delete(...args: unknown[]): Promise<unknown> {
      calls.delete.push(args);
      return repoState.one;
    }
  }
  const DiscountType = { PERCENTAGE: 'PERCENTAGE', FIXED_AMOUNT: 'FIXED_AMOUNT' };
  return {
    TenantDiscountRepository,
    TenantInvoiceRepository: Stub,
    TenantProductRepository: Stub,
    TenantCategoryRepository: Stub,
    TenantCustomerRepository: Stub,
    TenantOrderRepository: Stub,
    TenantBranchRepository: Stub,
    TenantUserRepository: Stub,
    TenantTableRepository: Stub,
    TenantRestaurantRepository: Stub,
    DiscountType,
    prisma: { tenant: { findUnique: jest.fn() } },
  };
});

const DISCOUNT_ID = '94364284-e295-4af5-8281-aa9e41dd209a';

describe('DiscountAdminService — AUDIT-009', () => {
  let service: DiscountAdminService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DiscountAdminService],
    }).compile();
    service = module.get(DiscountAdminService);
    repoState.one = {
      id: DISCOUNT_ID,
      code: 'SAVE10',
      type: 'PERCENTAGE',
      value: 10,
      active: true,
      usageCount: 0,
    };
    repoState.list = [repoState.one];
    calls.create = [];
    calls.update = [];
    calls.delete = [];
  });

  it('creates a code uppercased to match checkout lookup', async () => {
    repoState.list = [];
    await service.create({ code: 'save10', type: 'PERCENTAGE' as never, value: 10 });
    expect(calls.create[0][0]).toMatchObject({
      code: 'SAVE10',
      type: 'PERCENTAGE',
      value: 10,
      active: true,
    });
  });

  it('does not accept usageCount from the client on create', async () => {
    repoState.list = [];
    await service.create({ code: 'FIXED5', type: 'FIXED_AMOUNT' as never, value: 5 });
    expect(calls.create[0][0]).not.toHaveProperty('usageCount');
  });

  it('409s when the tenant already has the same code', async () => {
    await expect(
      service.create({ code: 'SAVE10', type: 'PERCENTAGE' as never, value: 10 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(calls.create).toHaveLength(0);
  });

  it('404s update/get/delete for unknown or foreign ids', async () => {
    repoState.one = null;
    await expect(service.findOne(DISCOUNT_ID)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update(DISCOUNT_ID, { active: false })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove(DISCOUNT_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deactivates via update without touching usageCount', async () => {
    await service.update(DISCOUNT_ID, { active: false });
    expect(calls.update[0][1]).toEqual({ active: false });
  });

  it('deletes a row (Order.discountId SetNull)', async () => {
    await expect(service.remove(DISCOUNT_ID)).resolves.toEqual({ id: DISCOUNT_ID, deleted: true });
    expect(calls.delete[0][0]).toBe(DISCOUNT_ID);
  });
});

describe('DiscountController AUDIT-009 authorization metadata', () => {
  it.each([
    ['findAll', 'read'],
    ['create', 'create'],
    ['findOne', 'read'],
    ['update', 'update'],
    ['remove', 'delete'],
  ] as const)('%s requires %s on Discount', (method, action) => {
    const meta = Reflect.getMetadata(
      REQUIRE_PERMISSION_KEY,
      DiscountController.prototype[method],
    );
    expect(meta).toEqual({ action, resource: 'Discount' });
  });
});

describe('AUDIT-009 discount DTO validation', () => {
  it('rejects an unknown discount type', async () => {
    const errors = await validate(
      plainToInstance(CreateDiscountRequestDto, { code: 'X', type: 'BOGO', value: 1 }),
    );
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  it('rejects a non-positive value', async () => {
    const errors = await validate(
      plainToInstance(CreateDiscountRequestDto, { code: 'X', type: 'PERCENTAGE', value: 0 }),
    );
    expect(errors.some((e) => e.property === 'value')).toBe(true);
  });

  it('does not declare usageCount or tenantId on write DTOs', () => {
    expect(Object.getOwnPropertyNames(new CreateDiscountRequestDto())).not.toContain('usageCount');
    expect(Object.getOwnPropertyNames(new CreateDiscountRequestDto())).not.toContain('tenantId');
    expect(Object.getOwnPropertyNames(new UpdateDiscountRequestDto())).not.toContain('usageCount');
  });
});
