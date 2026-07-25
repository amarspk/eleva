import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { KdsGateway } from './kds.gateway';
import { AuthService } from '../auth/auth.service';
import { CacheService } from '../common/cache/cache.service';
import { TenantBranchRepository, dbTenantContext } from '@zayjar/db';
import { OrderService } from '../order/order.service';
import { OrderStatus, OrderType, PaymentMethodType } from '@zayjar/types';
import { TenantOrderRepository, TenantInvoiceRepository, TenantRestaurantRepository, TenantProductRepository, prisma } from '@zayjar/db';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock-hash'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

describe('KdsGateway Integration Tests - TSK-2.1', () => {
  let gateway: KdsGateway;
  let orderService: OrderService;
  let _jwtService: JwtService;

  const mockServerToEmit = jest.fn();
  const mockServerTo = jest.fn().mockReturnValue({ emit: mockServerToEmit });

  const mockCacheService = {
    get: jest.fn().mockImplementation((_key, fetchFn) => fetchFn()),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    flush: jest.fn().mockResolvedValue(undefined),
    isCacheActive: () => false,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KdsGateway,
        OrderService,
        {
          provide: JwtService,
          useValue: {
            verifyAsync: jest.fn().mockResolvedValue({
              sub: 'user-integration',
              email: 'integration@zayjar.com',
              tenantId: 'tenant-integration',
              roles: [],
              permissions: [],
            }),
            signAsync: jest.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: {
            isTokenBlacklisted: jest.fn().mockResolvedValue(false),
            blacklistToken: jest.fn(),
            isCacheActive: jest.fn(),
          },
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    gateway = module.get<KdsGateway>(KdsGateway);
    orderService = module.get<OrderService>(OrderService);
    _jwtService = module.get<JwtService>(JwtService);

    (gateway as any).server = {
      to: mockServerTo,
    };

    // Inject gateway into OrderService manually for integration (constructor optional)
    (orderService as any).kdsGateway = gateway;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==========================================
  // Integration: OrderService creates order -> emits order.created
  // ==========================================
  it('should automatically broadcast order.created when OrderService.createOrder succeeds', async () => {
    const tenantId = 'tenant-integration';
    const branchId = 'branch-integration';
    const restaurantId = 'rest-integration';
    const productId = 'product-integration';

    // Mock branch and restaurant
    jest.spyOn(TenantBranchRepository.prototype, 'findById').mockResolvedValue({
      id: branchId,
      tenantId,
      restaurantId,
    } as any);

    jest.spyOn(TenantRestaurantRepository.prototype, 'findById').mockResolvedValue({
      id: restaurantId,
      taxPercentage: 10 as any,
    } as any);

    jest.spyOn(TenantProductRepository.prototype, 'findById').mockResolvedValue({
      id: productId,
      basePrice: 20 as any,
      isAvailable: true,
    } as any);

    jest.spyOn(TenantBranchRepository.prototype, 'findMany').mockResolvedValue([]);
    // Mock prisma transaction
    const mockOrder = {
      id: 'order-integration-1',
      tenantId,
      branchId,
      orderNumber: 'ORD-2026-99999',
      subtotal: 20,
      taxAmount: 2,
      total: 22,
      status: 'PENDING',
    };

    jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) =>
      cb({
        order: {
          create: jest.fn().mockResolvedValue(mockOrder),
        },
      }),
    );

    const createDto = {
      branchId,
      type: OrderType.DINE_IN,
      items: [{ productId, quantity: 1 }],
      paymentMethod: PaymentMethodType.CASH,
    };

    await dbTenantContext.run({ tenantId }, async () => {
      const result = await orderService.createOrder(createDto, tenantId);

      expect(result.id).toBe(mockOrder.id);
      // Verify KDS broadcast happened automatically
      expect(mockServerTo).toHaveBeenCalledWith(`tenant:${tenantId}:branch:${branchId}`);
      expect(mockServerToEmit).toHaveBeenCalledWith(
        'order.created',
        expect.objectContaining({
          event: 'order.created',
          tenantId,
          branchId,
          data: expect.objectContaining({ id: mockOrder.id }),
        }),
      );
    });
  });

  // ==========================================
  // Integration: Order status transitions -> correct events
  // ==========================================
  it('should broadcast correct events on each valid status transition', async () => {
    const tenantId = 'tenant-1';
    const branchId = 'branch-1';
    const orderId = 'order-1';

    const transitions = [
      { current: OrderStatus.PENDING, next: OrderStatus.ACCEPTED, expectedEvent: 'order.accepted' },
      { current: OrderStatus.ACCEPTED, next: OrderStatus.PREPARING, expectedEvent: 'order.preparing' },
      { current: OrderStatus.PREPARING, next: OrderStatus.READY, expectedEvent: 'order.ready' },
      { current: OrderStatus.READY, next: OrderStatus.COMPLETED, expectedEvent: 'order.completed' },
    ];

    for (const t of transitions) {
      jest.clearAllMocks();

      jest.spyOn(TenantOrderRepository.prototype, 'findById').mockResolvedValue({
        id: orderId,
        tenantId,
        branchId,
        status: t.current,
      } as any);

      jest.spyOn(TenantOrderRepository.prototype, 'update').mockResolvedValue({
        id: orderId,
        tenantId,
        branchId,
        status: t.next,
      } as any);

      // Mock invoice for COMPLETED
      if (t.next === OrderStatus.COMPLETED) {
        jest.spyOn(TenantInvoiceRepository.prototype, 'create').mockResolvedValue({
          id: 'inv-1',
          invoiceNumber: 'INV-001',
        } as any);
      }

      await dbTenantContext.run({ tenantId }, async () => {
        const updated = await orderService.updateOrderStatus(orderId, { status: t.next });
        expect(updated.status).toBe(t.next);

        expect(mockServerTo).toHaveBeenCalledWith(`tenant:${tenantId}:branch:${branchId}`);
        expect(mockServerToEmit).toHaveBeenCalledWith(
          t.expectedEvent,
          expect.objectContaining({
            event: t.expectedEvent,
            data: expect.objectContaining({ id: orderId }),
          }),
        );
      });
    }
  });

  // ==========================================
  // Integration: cancelOrder -> order.cancelled
  // ==========================================
  it('should broadcast order.cancelled on cancelOrder', async () => {
    const tenantId = 'tenant-1';
    const branchId = 'branch-1';
    const orderId = 'order-cancel-1';

    jest.spyOn(TenantOrderRepository.prototype, 'findById').mockResolvedValue({
      id: orderId,
      tenantId,
      branchId,
      status: OrderStatus.PENDING,
    } as any);

    jest.spyOn(TenantOrderRepository.prototype, 'update').mockResolvedValue({
      id: orderId,
      tenantId,
      branchId,
      status: OrderStatus.CANCELLED,
    } as any);

    await dbTenantContext.run({ tenantId }, async () => {
      const cancelled = await orderService.cancelOrder(orderId);
      expect(cancelled.status).toBe(OrderStatus.CANCELLED);
      expect(mockServerTo).toHaveBeenCalledWith(`tenant:${tenantId}:branch:${branchId}`);
      expect(mockServerToEmit).toHaveBeenCalledWith('order.cancelled', expect.objectContaining({ event: 'order.cancelled' }));
    });
  });

  // ==========================================
  // Integration: Tenant isolation enforcement
  // ==========================================
  it('should preserve tenant isolation: broadcast uses tenantId from order DB, not client', async () => {
    const tenantIdReal = 'real-tenant-uuid';
    const branchId = 'branch-uuid';
    const orderId = 'order-isolation';

    jest.spyOn(TenantOrderRepository.prototype, 'findById').mockResolvedValue({
      id: orderId,
      tenantId: tenantIdReal,
      branchId,
      status: OrderStatus.PENDING,
    } as any);

    jest.spyOn(TenantOrderRepository.prototype, 'update').mockResolvedValue({
      id: orderId,
      tenantId: tenantIdReal,
      branchId,
      status: OrderStatus.ACCEPTED,
    } as any);

    await dbTenantContext.run({ tenantId: tenantIdReal }, async () => {
      await orderService.updateOrderStatus(orderId, { status: OrderStatus.ACCEPTED });
      // Room must be built from real tenantId, not any client-supplied value
      expect(mockServerTo).toHaveBeenCalledWith(`tenant:${tenantIdReal}:branch:${branchId}`);
      const emitted = mockServerToEmit.mock.calls[0][1];
      expect(emitted.tenantId).toBe(tenantIdReal);
      expect(emitted.tenantId).not.toBe('fake-tenant-from-client');
    });
  });

  it('should join and leave branch rooms with tenant scoping', async () => {
    const tenantId = 'tenant-join-test';
    const branchId = 'branch-join-test';

    const mockSocket: any = {
      id: 'socket-join',
      data: { user: { id: 'user-1', tenantId, roles: [], permissions: [] } },
      emit: jest.fn(),
      join: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined),
    };

    jest.spyOn(TenantBranchRepository.prototype, 'findById').mockResolvedValue({
      id: branchId,
      tenantId,
    } as any);

    jest.spyOn(dbTenantContext, 'run').mockImplementation((ctx: any, cb: any) => {
      expect(ctx.tenantId).toBe(tenantId);
      return cb();
    });

    await gateway.handleJoinBranch(mockSocket, { branchId });
    expect(mockSocket.join).toHaveBeenCalledWith(`tenant:${tenantId}:branch:${branchId}`);

    await gateway.handleLeaveBranch(mockSocket, { branchId });
    expect(mockSocket.leave).toHaveBeenCalledWith(`tenant:${tenantId}:branch:${branchId}`);
  });
});
