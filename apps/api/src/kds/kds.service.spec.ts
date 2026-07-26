import { Test, TestingModule } from '@nestjs/testing';
import { KdsService } from './kds.service';
import { KdsGateway } from './kds.gateway';
import { BadRequestException } from '@nestjs/common';
import { CookingStatus } from '@zayjar/types';

jest.mock('@zayjar/db', () => {
  const MockRepo = jest.fn().mockImplementation(() => ({
    create: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
    delete: jest.fn(),
  }));
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
});
