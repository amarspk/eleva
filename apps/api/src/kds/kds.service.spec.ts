import { Test, TestingModule } from '@nestjs/testing';
import { KdsService } from './kds.service';
import { KdsGateway } from './kds.gateway';
import { BadRequestException } from '@nestjs/common';
import { CookingStatus } from '@zayjar/types';

jest.mock('@zayjar/db', () => {
  // Methods are defined on the PROTOTYPE (not instance properties) so tests
  // can jest.spyOn(TenantXRepository.prototype, 'method'). NOTE: every
  // repository maps to the SAME MockRepo class in this spec's factory, so
  // their prototype methods are shared — tests must not set conflicting
  // implementations on different repositories' `update` in one test.
  class MockRepo {}
  const proto = MockRepo.prototype as unknown as Record<string, jest.Mock>;
  proto.create = jest.fn();
  proto.findMany = jest.fn().mockResolvedValue([]);
  proto.findById = jest.fn().mockResolvedValue(null);
  proto.update = jest.fn();
  proto.delete = jest.fn();
  return {
    TenantOrderRepository: MockRepo,
    TenantOrderItemRepository: MockRepo,
    TenantBranchRepository: MockRepo,
    TenantProductRepository: MockRepo,
    TenantProductSizeRepository: MockRepo,
    TenantKitchenQueueRepository: MockRepo,
    prisma: {
      kitchenQueue: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
      order: { findFirst: jest.fn().mockResolvedValue(null) },
    },
    dbTenantContext: {
      run: jest.fn((_ctx: unknown, fn: () => Promise<unknown>) => fn()),
    },
  };
});

describe('KdsService', () => {
  let service: KdsService;
  let gateway: jest.Mocked<KdsGateway>;

  beforeEach(async () => {
    gateway = {
      broadcastOrderEvent: jest.fn(),
      emitTicketPriorityChanged: jest.fn(),
      emitCookingStatusChanged: jest.fn(),
    } as unknown as jest.Mocked<KdsGateway>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KdsService,
        { provide: KdsGateway, useValue: gateway },
      ],
    }).compile();

    service = module.get<KdsService>(KdsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateCookingTransition', () => {
    const validate = (current: CookingStatus, next: CookingStatus) =>
      (service as unknown as { validateCookingTransition: (c: CookingStatus, n: CookingStatus) => void }).validateCookingTransition(current, next);

    it('should allow PENDING -> PREPARING', () => {
      expect(() => validate(CookingStatus.PENDING, CookingStatus.PREPARING)).not.toThrow();
    });

    it('should allow PREPARING -> COOKED', () => {
      expect(() => validate(CookingStatus.PREPARING, CookingStatus.COOKED)).not.toThrow();
    });

    it('should allow COOKED -> SERVED', () => {
      expect(() => validate(CookingStatus.COOKED, CookingStatus.SERVED)).not.toThrow();
    });

    it('should throw for SERVED -> any (terminal state)', () => {
      expect(() => validate(CookingStatus.SERVED, CookingStatus.PENDING)).toThrow(BadRequestException);
    });

    it('should throw for PREPARING -> PENDING (backward transition)', () => {
      expect(() => validate(CookingStatus.PREPARING, CookingStatus.PENDING)).toThrow(BadRequestException);
    });

    it('should allow PENDING -> SERVED (skipping steps)', () => {
      expect(() => validate(CookingStatus.PENDING, CookingStatus.SERVED)).not.toThrow();
    });

    it('should allow same status (no-op)', () => {
      expect(() => validate(CookingStatus.PREPARING, CookingStatus.PREPARING)).not.toThrow();
    });
  });

  describe('Phase 4 P0 — updateCookingStatus branch-scope enforcement', () => {
    it('denies a branch-scoped user updating an order item in a foreign branch', async () => {
      const { TenantOrderItemRepository, prisma } = require('@zayjar/db');
      const { ForbiddenException } = require('@nestjs/common');

      (TenantOrderItemRepository.prototype.findById as jest.Mock).mockResolvedValue({
        id: 'oi-1',
        orderId: 'order-x',
        cookingStatus: 'PENDING',
      });
      (prisma.order.findFirst as jest.Mock).mockResolvedValue({
        id: 'order-x',
        branchId: 'branch-foreign',
      });

      await expect(
        service.updateCookingStatus('oi-1', CookingStatus.PREPARING, 'tenant-1', ['branch-1']),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows a branch-scoped user updating an order item in an assigned branch', async () => {
      const { TenantOrderItemRepository, prisma } = require('@zayjar/db');

      (TenantOrderItemRepository.prototype.findById as jest.Mock).mockResolvedValue({
        id: 'oi-1',
        orderId: 'order-x',
        cookingStatus: 'PENDING',
      });
      // First findFirst = the new branch check (assigned branch -> pass);
      // second findFirst = the broadcast parent-order fetch.
      (prisma.order.findFirst as jest.Mock).mockResolvedValue({
        id: 'order-x',
        branchId: 'branch-1',
        tenantId: 'tenant-1',
      });
      const updateMock = jest.fn().mockResolvedValue({ id: 'oi-1', cookingStatus: 'PREPARING' });
      TenantOrderItemRepository.prototype.update = updateMock;
      // kitchenQueue.findFirst resolves null -> updateKitchenQueueTimestamps
      // returns early and never calls kitchenQueueRepository.update (which
      // shares the same MockRepo prototype in this spec's factory).
      (prisma.kitchenQueue.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.updateCookingStatus('oi-1', CookingStatus.PREPARING, 'tenant-1', ['branch-1']);
      expect(result.cookingStatus).toBe('PREPARING');
      expect(updateMock).toHaveBeenCalledWith('oi-1', { cookingStatus: 'PREPARING' });
    });
  });
});
