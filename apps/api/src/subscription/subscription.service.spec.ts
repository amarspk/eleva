import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionService } from './subscription.service';
import { prisma, dbTenantContext } from '@zayjar/db';
import { ForbiddenException } from '@nestjs/common';
import { TenantBranchRepository, TenantProductRepository, TenantRestaurantRepository } from '@zayjar/db';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock-hash'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

describe('SubscriptionService Unit Tests - TSK-3.6 Subscription Gating (DOC-001 1.10, DOC-005 4.7)', () => {
  let service: SubscriptionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SubscriptionService],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
    jest.clearAllMocks();
  });

  it('should allow operations when subscription is ACTIVE', async () => {
    const tenantId = 'tenant-123';
    jest.spyOn(prisma.subscription, 'findFirst').mockResolvedValue({
      id: 'sub_123',
      tenantId,
      status: 'ACTIVE',
      plan: { id: 'plan_gold', name: 'Gold', maxBranches: 5, maxProductsPerBranch: 100, allowCustomDomains: true, allowOnlinePayments: true, allowAnalytics: true },
    } as any);
    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({ id: tenantId, status: 'ACTIVE' } as any);

    const result = await service.checkSubscriptionStatus(tenantId);
    expect(result.status).toBe('ACTIVE');
  });

  it('should block operations when subscription is UNPAID', async () => {
    const tenantId = 'tenant-123';
    jest.spyOn(prisma.subscription, 'findFirst').mockResolvedValue({
      id: 'sub_123',
      tenantId,
      status: 'UNPAID',
      plan: { name: 'Gold', maxBranches: 5 },
    } as any);
    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({ id: tenantId, status: 'UNPAID' } as any);

    await expect(service.checkSubscriptionStatus(tenantId)).rejects.toThrow(ForbiddenException);
  });

  it('should block operations when subscription is CANCELED', async () => {
    const tenantId = 'tenant-123';
    jest.spyOn(prisma.subscription, 'findFirst').mockResolvedValue({
      id: 'sub_123',
      tenantId,
      status: 'CANCELED',
      plan: { name: 'Gold' },
    } as any);
    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({ id: tenantId, status: 'CANCELED' } as any);

    await expect(service.checkSubscriptionStatus(tenantId)).rejects.toThrow(ForbiddenException);
  });

  it('should allow PAST_DUE with warning (grace period)', async () => {
    const tenantId = 'tenant-123';
    jest.spyOn(prisma.subscription, 'findFirst').mockResolvedValue({
      id: 'sub_123',
      tenantId,
      status: 'PAST_DUE',
      plan: { name: 'Gold' },
    } as any);
    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({ id: tenantId, status: 'PAST_DUE' } as any);

    const result = await service.checkSubscriptionStatus(tenantId);
    expect(result.status).toBe('PAST_DUE');
  });

  it('should enforce branch limit (maxBranches)', async () => {
    const tenantId = 'tenant-123';
    jest.spyOn(prisma.subscription, 'findFirst').mockResolvedValue({
      id: 'sub_123',
      tenantId,
      status: 'ACTIVE',
      plan: { id: 'plan_silver', name: 'Silver', maxBranches: 1, maxProductsPerBranch: 100 },
    } as any);
    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({ id: tenantId, status: 'ACTIVE' } as any);
    jest.spyOn(TenantBranchRepository.prototype, 'count').mockResolvedValue(1 as any);
    jest.spyOn(dbTenantContext, 'run').mockImplementation((ctx: any, cb: any) => cb());

    await expect(service.checkBranchLimit(tenantId)).rejects.toThrow(/Branch limit reached/);
  });

  it('should allow branch creation when under limit', async () => {
    const tenantId = 'tenant-123';
    jest.spyOn(prisma.subscription, 'findFirst').mockResolvedValue({
      id: 'sub_123',
      tenantId,
      status: 'ACTIVE',
      plan: { id: 'plan_gold', name: 'Gold', maxBranches: 5 },
    } as any);
    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({ id: tenantId, status: 'ACTIVE' } as any);
    jest.spyOn(TenantBranchRepository.prototype, 'count').mockResolvedValue(2 as any);
    jest.spyOn(dbTenantContext, 'run').mockImplementation((ctx: any, cb: any) => cb());

    const result = await service.checkBranchLimit(tenantId);
    expect(result.currentCount).toBe(2);
    expect(result.maxBranches).toBe(5);
  });

  it('should allow restaurant creation when under maxRestaurants', async () => {
    const tenantId = 'tenant-123';
    jest.spyOn(prisma.subscription, 'findFirst').mockResolvedValue({
      id: 'sub_123',
      tenantId,
      status: 'ACTIVE',
      plan: { id: 'plan_growth', name: 'Growth', maxRestaurants: 3 },
    } as any);
    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({ id: tenantId, status: 'ACTIVE' } as any);
    jest.spyOn(TenantRestaurantRepository.prototype, 'count').mockResolvedValue(1 as any);
    jest.spyOn(dbTenantContext, 'run').mockImplementation((ctx: any, cb: any) => cb());

    const result = await service.checkRestaurantLimit(tenantId);
    expect(result.currentCount).toBe(1);
    expect(result.maxRestaurants).toBe(3);
  });

  it('should reject restaurant creation when maxRestaurants is reached', async () => {
    const tenantId = 'tenant-123';
    jest.spyOn(prisma.subscription, 'findFirst').mockResolvedValue({
      id: 'sub_123',
      tenantId,
      status: 'ACTIVE',
      plan: { id: 'plan_starter', name: 'Starter', maxRestaurants: 1 },
    } as any);
    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({ id: tenantId, status: 'ACTIVE' } as any);
    jest.spyOn(TenantRestaurantRepository.prototype, 'count').mockResolvedValue(1 as any);
    jest.spyOn(dbTenantContext, 'run').mockImplementation((ctx: any, cb: any) => cb());

    await expect(service.checkRestaurantLimit(tenantId)).rejects.toThrow(/Restaurant limit reached/);
  });

  it('should not count soft-deleted restaurants toward maxRestaurants (repository default count)', async () => {
    const tenantId = 'tenant-123';
    jest.spyOn(prisma.subscription, 'findFirst').mockResolvedValue({
      id: 'sub_123',
      tenantId,
      status: 'ACTIVE',
      plan: { id: 'plan_starter', name: 'Starter', maxRestaurants: 1 },
    } as any);
    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({ id: tenantId, status: 'ACTIVE' } as any);
    // TenantRestaurantRepository.count applies deletedAt: null via scopedWhere
    // (softDeletable = true). A tenant with only archived brands reports 0.
    jest.spyOn(TenantRestaurantRepository.prototype, 'count').mockResolvedValue(0 as any);
    jest.spyOn(dbTenantContext, 'run').mockImplementation((ctx: any, cb: any) => cb());

    const result = await service.checkRestaurantLimit(tenantId);
    expect(result.currentCount).toBe(0);
    expect(result.maxRestaurants).toBe(1);
  });

  it('should enforce product limit (maxProductsPerBranch)', async () => {
    const tenantId = 'tenant-123';
    jest.spyOn(prisma.subscription, 'findFirst').mockResolvedValue({
      id: 'sub_123',
      tenantId,
      status: 'ACTIVE',
      plan: { id: 'plan_silver', name: 'Silver', maxProductsPerBranch: 2 },
    } as any);
    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({ id: tenantId, status: 'ACTIVE' } as any);
    jest.spyOn(TenantProductRepository.prototype, 'count').mockResolvedValue(2 as any);
    jest.spyOn(dbTenantContext, 'run').mockImplementation((ctx: any, cb: any) => cb());

    await expect(service.checkProductLimit(tenantId)).rejects.toThrow(/Product limit reached/);
  });

  it('should block custom domains when not allowed by plan', async () => {
    const tenantId = 'tenant-123';
    jest.spyOn(prisma.subscription, 'findFirst').mockResolvedValue({
      id: 'sub_123',
      tenantId,
      status: 'ACTIVE',
      plan: { id: 'plan_basic', name: 'Basic', allowCustomDomains: false },
    } as any);
    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({ id: tenantId, status: 'ACTIVE' } as any);

    await expect(service.checkCustomDomainAllowed(tenantId)).rejects.toThrow(/Custom domains not allowed/);
  });

  it('should allow custom domains when plan permits', async () => {
    const tenantId = 'tenant-123';
    jest.spyOn(prisma.subscription, 'findFirst').mockResolvedValue({
      id: 'sub_123',
      tenantId,
      status: 'ACTIVE',
      plan: { id: 'plan_gold', name: 'Gold', allowCustomDomains: true },
    } as any);
    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({ id: tenantId, status: 'ACTIVE' } as any);

    const result = await service.checkCustomDomainAllowed(tenantId);
    expect(result).toBe(true);
  });

  it('should preserve tenant isolation - checks use tenantId from JWT, not client', async () => {
    const realTenantId = 'real-tenant';
    const evilTenantId = 'evil-tenant';

    let capturedTenantId: string | null = null;
    jest.spyOn(prisma.subscription, 'findFirst').mockImplementation((async (args: any) => {
      capturedTenantId = args.where.tenantId;
      return {
        id: 'sub_123',
        tenantId: realTenantId,
        status: 'ACTIVE',
        plan: { name: 'Gold', maxBranches: 10 },
      } as any;
    }) as any);
    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({ id: realTenantId, status: 'ACTIVE' } as any);
    jest.spyOn(TenantBranchRepository.prototype, 'count').mockResolvedValue(0 as any);
    jest.spyOn(dbTenantContext, 'run').mockImplementation((ctx: any, cb: any) => cb());

    await service.checkBranchLimit(realTenantId);

    expect(capturedTenantId).toBe(realTenantId);
    expect(capturedTenantId).not.toBe(evilTenantId);
  });
});
