import { Test, TestingModule } from '@nestjs/testing';
import { OrderService } from './order.service';
import {
  TenantBranchRepository,
  TenantProductRepository,
  TenantProductSizeRepository,
  TenantAddonItemRepository,
  TenantOrderRepository,
  TenantInvoiceRepository,
  TenantRestaurantRepository,
  TenantTableRepository,
  prisma,
} from '@zayjar/db';
import { OrderStatus, OrderType, PaymentMethodType } from '@zayjar/types';
import { NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DISCOUNT_INVALID_MESSAGE } from '../discount/discount.service';

// Mocking argon2 C++ native modules to prevent Jest V8 multithreaded segmentation faults
jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock-argon2-hash'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

describe('OrderService Unit Tests', () => {
  let service: OrderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrderService],
    }).compile();

    service = module.get<OrderService>(OrderService);
    jest.clearAllMocks();
  });

  // ==========================================
  // 1. Server-Side Totals Calculation (Never Trust Client Prices)
  // ==========================================
  it('should calculate subtotal, taxes (based on branch tax percentage), and final total strictly using database values', async () => {
    const tenantId = 'tenant-uuid-1111';
    const branchId = 'branch-uuid-1234';
    const productId = 'prod-uuid-999';
    const sizeId = 'size-uuid-222';
    const addonItemId = 'addon-item-uuid-333';

    // A. Mock database values for Branch
    jest.spyOn(TenantBranchRepository.prototype, 'findById').mockResolvedValue({
      id: branchId,
      tenantId,
      restaurantId: 'rest-uuid-999',
    } as any);

    // B. Mock Restaurant (15% tax)
    jest.spyOn(TenantRestaurantRepository.prototype, 'findById').mockResolvedValue({
      id: 'rest-uuid-999',
      taxPercentage: 15.00 as any,
    } as any);

    // C. Mock Product ($10.00 basePrice)
    jest.spyOn(TenantProductRepository.prototype, 'findById').mockResolvedValue({
      id: productId,
      basePrice: 10.00 as any,
      isAvailable: true,
    } as any);

    // D. Mock ProductSize (+$2.50 adjustment)
    jest.spyOn(TenantProductSizeRepository.prototype, 'findMany').mockResolvedValue([
      { id: sizeId, priceAdjustment: 2.50 as any } as any,
    ]);

    // E. Mock AddonItem (+$1.50 price)
    jest.spyOn(TenantAddonItemRepository.prototype, 'findMany').mockResolvedValue([
      { id: addonItemId, price: 1.50 as any, isAvailable: true } as any,
    ]);

    // F. Mock Prisma $transaction
    const mockOrderResult = {
      id: 'order-1',
      orderNumber: 'ORD-2026-12345',
      subtotal: 28.00, // (10.00 base + 2.50 size + 1.50 addon) * 2 quantity = 28.00
      taxAmount: 4.20,  // 28.00 * 15% = 4.20
      total: 32.20,     // 28.00 + 4.20 = 32.20
    };
    const txMock = {
      order: {
        create: jest.fn().mockResolvedValue(mockOrderResult),
      },
      kitchenQueue: {
        create: jest.fn().mockResolvedValue({ id: 'kq-1', ticketNumber: '12345', priority: 'NORMAL' }),
      },
      discount: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(txMock));

    const createDto = {
      branchId,
      type: OrderType.DINE_IN,
      items: [
        {
          productId,
          sizeId,
          quantity: 2,
          addons: [{ addonItemId }],
        },
      ],
      paymentMethod: PaymentMethodType.CASH,
    };

    // Act
    const result = await service.createOrder(createDto, tenantId);

    // Assert
    expect(result.subtotal).toBe(28.00);
    expect(result.taxAmount).toBe(4.20);
    expect(result.total).toBe(32.20);
    expect(txMock.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotal: 28.00,
          taxAmount: 4.20,
          total: 32.20,
          // Sprint 2 Task 3: the DTO's paymentMethod is persisted on the order.
          paymentMethod: PaymentMethodType.CASH,
        }),
      }),
    );
  });

  // ==========================================
  // 1b. Discount Engine (Sprint 2 Task 4)
  // ==========================================
  it('should apply a percentage discount code and persist discount fields on the order', async () => {
    const tenantId = 'tenant-uuid-1111';
    const branchId = 'branch-uuid-1234';
    const productId = 'prod-uuid-999';
    const sizeId = 'size-uuid-222';
    const addonItemId = 'addon-item-uuid-333';

    jest.spyOn(TenantBranchRepository.prototype, 'findById').mockResolvedValue({
      id: branchId, tenantId, restaurantId: 'rest-uuid-999',
    } as any);
    jest.spyOn(TenantRestaurantRepository.prototype, 'findById').mockResolvedValue({
      id: 'rest-uuid-999', taxPercentage: 15.00 as any,
    } as any);
    jest.spyOn(TenantProductRepository.prototype, 'findById').mockResolvedValue({
      id: productId, basePrice: 10.00 as any, isAvailable: true,
    } as any);
    jest.spyOn(TenantProductSizeRepository.prototype, 'findMany').mockResolvedValue([
      { id: sizeId, priceAdjustment: 2.50 as any } as any,
    ]);
    jest.spyOn(TenantAddonItemRepository.prototype, 'findMany').mockResolvedValue([
      { id: addonItemId, price: 1.50 as any, isAvailable: true } as any,
    ]);

    const txMock = {
      order: { create: jest.fn().mockResolvedValue({ id: 'order-disc', total: 29.40 }) },
      kitchenQueue: { create: jest.fn().mockResolvedValue({ id: 'kq-1' }) },
      discount: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'disc-1', type: 'PERCENTAGE', value: 10, active: true,
          validFrom: null, validTo: null, usageLimit: null, usageCount: 0,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(txMock));

    await service.createOrder(
      {
        branchId,
        type: OrderType.DINE_IN,
        items: [{ productId, sizeId, quantity: 2, addons: [{ addonItemId }] }],
        paymentMethod: PaymentMethodType.CASH,
        // normalization: trimmed + uppercased before lookup
        discountCode: ' save10 ',
      },
      tenantId,
    );

    // subtotal 28.00, tax 4.20 (15%), discount 10% = 2.80 → total 29.40
    expect(txMock.discount.findUnique).toHaveBeenCalledWith({
      where: { tenantId_code: { tenantId, code: 'SAVE10' } },
    });
    expect(txMock.discount.update).toHaveBeenCalledWith({
      where: { id: 'disc-1' },
      data: { usageCount: { increment: 1 } },
    });
    expect(txMock.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          discountAmount: 2.80,
          discountId: 'disc-1',
          discountCode: 'SAVE10',
          total: 29.40,
        }),
      }),
    );
  });

  it('should reject an invalid discount code with the uniform error and not create the order', async () => {
    const tenantId = 'tenant-uuid-1111';
    const branchId = 'branch-uuid-1234';
    const productId = 'prod-uuid-999';
    const sizeId = 'size-uuid-222';
    const addonItemId = 'addon-item-uuid-333';

    jest.spyOn(TenantBranchRepository.prototype, 'findById').mockResolvedValue({
      id: branchId, tenantId, restaurantId: 'rest-uuid-999',
    } as any);
    jest.spyOn(TenantRestaurantRepository.prototype, 'findById').mockResolvedValue({
      id: 'rest-uuid-999', taxPercentage: 15.00 as any,
    } as any);
    jest.spyOn(TenantProductRepository.prototype, 'findById').mockResolvedValue({
      id: productId, basePrice: 10.00 as any, isAvailable: true,
    } as any);
    jest.spyOn(TenantProductSizeRepository.prototype, 'findMany').mockResolvedValue([
      { id: sizeId, priceAdjustment: 2.50 as any } as any,
    ]);
    jest.spyOn(TenantAddonItemRepository.prototype, 'findMany').mockResolvedValue([
      { id: addonItemId, price: 1.50 as any, isAvailable: true } as any,
    ]);

    const txMock = {
      order: { create: jest.fn().mockResolvedValue({}) },
      kitchenQueue: { create: jest.fn().mockResolvedValue({}) },
      discount: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(txMock));

    await expect(
      service.createOrder(
        {
          branchId,
          type: OrderType.DINE_IN,
          items: [{ productId, sizeId, quantity: 2, addons: [{ addonItemId }] }],
          paymentMethod: PaymentMethodType.CASH,
          discountCode: 'NOPE',
        },
        tenantId,
      ),
    ).rejects.toThrow(DISCOUNT_INVALID_MESSAGE);

    expect(txMock.discount.update).not.toHaveBeenCalled();
    expect(txMock.order.create).not.toHaveBeenCalled();
  });

  it('should not resolve a discount when no discountCode is provided', async () => {
    const tenantId = 'tenant-uuid-1111';
    const branchId = 'branch-uuid-1234';
    const productId = 'prod-uuid-999';

    jest.spyOn(TenantBranchRepository.prototype, 'findById').mockResolvedValue({
      id: branchId, tenantId, restaurantId: 'rest-uuid-999',
    } as any);
    jest.spyOn(TenantRestaurantRepository.prototype, 'findById').mockResolvedValue({
      id: 'rest-uuid-999', taxPercentage: 0 as any,
    } as any);
    jest.spyOn(TenantProductRepository.prototype, 'findById').mockResolvedValue({
      id: productId, basePrice: 10.00 as any, isAvailable: true,
    } as any);

    const txMock = {
      order: { create: jest.fn().mockResolvedValue({ id: 'order-node', total: 10.00 }) },
      kitchenQueue: { create: jest.fn().mockResolvedValue({ id: 'kq-1' }) },
      discount: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(txMock));

    await service.createOrder(
      {
        branchId,
        type: OrderType.DINE_IN,
        items: [{ productId, quantity: 1 }],
        paymentMethod: PaymentMethodType.CASH,
      },
      tenantId,
    );

    expect(txMock.discount.findUnique).not.toHaveBeenCalled();
    expect(txMock.discount.update).not.toHaveBeenCalled();
    expect(txMock.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ discountAmount: 0, discountCode: null, discountId: null }),
      }),
    );
  });

  // ==========================================
  // 2. Client-Side Request Forgery & Ownership Validations
  // ==========================================
  it('should throw NotFoundException if the targeted branch does not belong to the active tenant workspace', async () => {
    const tenantId = 'tenant-uuid-1111';
    
    // Mock branch search to return null (indicating unauthorized or missing branch)
    jest.spyOn(TenantBranchRepository.prototype, 'findById').mockResolvedValue(null);

    const createDto = {
      branchId: 'unauthorized-branch',
      type: OrderType.TAKE_AWAY,
      items: [],
      paymentMethod: PaymentMethodType.CASH,
    };

    await expect(
      service.createOrder(createDto, tenantId)
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException if a product is currently unavailable or missing', async () => {
    const tenantId = 'tenant-uuid-1111';
    const branchId = 'branch-uuid-1234';

    jest.spyOn(TenantBranchRepository.prototype, 'findById').mockResolvedValue({
      id: branchId,
      tenantId,
      restaurantId: 'rest-uuid-999',
    } as any);

    jest.spyOn(TenantRestaurantRepository.prototype, 'findById').mockResolvedValue({
      id: 'rest-uuid-999',
      taxPercentage: 0 as any,
    } as any);

    // Mock product lookup to return null (unauthorized or non-existent)
    jest.spyOn(TenantProductRepository.prototype, 'findById').mockResolvedValue(null);

    const createDto = {
      branchId,
      type: OrderType.TAKE_AWAY,
      items: [{ productId: 'missing-product', quantity: 1 }],
      paymentMethod: PaymentMethodType.CASH,
    };

    await expect(
      service.createOrder(createDto, tenantId)
    ).rejects.toThrow(NotFoundException);
  });

  // ==========================================
  // 3. Strict State Machine Transitions Verification
  // ==========================================
  it('should permit sequentially valid transitions and reject illegal steps', async () => {
    const id = 'order-uuid-999';

    // Mock order in PENDING status
    const orderMock = {
      id,
      status: OrderStatus.PENDING,
    };

    jest.spyOn(TenantOrderRepository.prototype, 'findById').mockResolvedValue(orderMock as any);
    const updateSpy = jest.spyOn(TenantOrderRepository.prototype, 'update').mockResolvedValue({ ...orderMock, status: OrderStatus.ACCEPTED } as any);

    // Transition from PENDING to ACCEPTED is valid
    const res = await service.updateOrderStatus(id, { status: OrderStatus.ACCEPTED });
    expect(res.status).toBe(OrderStatus.ACCEPTED);
    expect(updateSpy).toHaveBeenCalledWith(id, { status: OrderStatus.ACCEPTED });

    // Transition from PENDING to COMPLETED directly is illegal
    await expect(
      service.updateOrderStatus(id, { status: OrderStatus.COMPLETED })
    ).rejects.toThrow(BadRequestException);
  });

  it('should block cancellations of completed orders', async () => {
    const id = 'order-uuid-999';

    jest.spyOn(TenantOrderRepository.prototype, 'findById').mockResolvedValue({
      id,
      status: OrderStatus.COMPLETED,
    } as any);

    await expect(
      service.cancelOrder(id)
    ).rejects.toThrow(ConflictException);
  });

  // ==========================================
  // 4. Atomic Transaction Rollbacks on Failures
  // ==========================================
  it('should ensure database operations roll back atomically if creation fails mid-transaction', async () => {
    const tenantId = 'tenant-uuid-1111';
    const branchId = 'branch-uuid-1234';
    const productId = 'prod-uuid-999';

    jest.spyOn(TenantBranchRepository.prototype, 'findById').mockResolvedValue({
      id: branchId,
      tenantId,
      restaurantId: 'rest-uuid-999',
    } as any);

    jest.spyOn(TenantRestaurantRepository.prototype, 'findById').mockResolvedValue({
      id: 'rest-uuid-999',
      taxPercentage: 0 as any,
    } as any);

    jest.spyOn(TenantProductRepository.prototype, 'findById').mockResolvedValue({
      id: productId,
      basePrice: 10.00 as any,
      isAvailable: true,
    } as any);

    // Mock transaction that fails during execution
    jest.spyOn(prisma, '$transaction').mockImplementation(async () => {
      throw new Error('Database transaction connection timeout.');
    });

    const createDto = {
      branchId,
      type: OrderType.TAKE_AWAY,
      items: [{ productId, quantity: 1 }],
      paymentMethod: PaymentMethodType.CASH,
    };

    await expect(
      service.createOrder(createDto, tenantId)
    ).rejects.toThrow('Database transaction connection timeout.');
  });

  // ==========================================
  // 5. Full Order Lifecycle: PENDING → COMPLETED with Invoice
  // ==========================================
  it('should complete full lifecycle PENDING → ACCEPTED → PREPARING → READY → COMPLETED with invoice generation', async () => {
    const id = 'order-lifecycle-001';
    const _orderId = 'inv-order-001';
    const tenantId = 'tenant-uuid-1111';
    const branchId = 'branch-uuid-1234';

    // Mock order at each stage
    const makeOrder = (status: OrderStatus): any => ({
      id,
      tenantId,
      branchId,
      orderNumber: 'ORD-2026-12345',
      status,
      subtotal: 50.00,
      taxAmount: 5.00,
      total: 55.00,
    });

    jest.spyOn(TenantOrderRepository.prototype, 'findById')
      .mockResolvedValueOnce(makeOrder(OrderStatus.PENDING))
      .mockResolvedValueOnce(makeOrder(OrderStatus.ACCEPTED))
      .mockResolvedValueOnce(makeOrder(OrderStatus.PREPARING))
      .mockResolvedValueOnce(makeOrder(OrderStatus.READY));

    jest.spyOn(TenantOrderRepository.prototype, 'update')
      .mockResolvedValueOnce(makeOrder(OrderStatus.ACCEPTED))
      .mockResolvedValueOnce(makeOrder(OrderStatus.PREPARING))
      .mockResolvedValueOnce(makeOrder(OrderStatus.READY))
      .mockResolvedValueOnce(makeOrder(OrderStatus.COMPLETED));

    const invoiceSpy = jest.spyOn(TenantInvoiceRepository.prototype, 'create')
      .mockResolvedValue({ id: 'inv-1', invoiceNumber: 'INV-2026-999999' } as any);

    // Execute full lifecycle
    const step1 = await service.updateOrderStatus(id, { status: OrderStatus.ACCEPTED });
    expect(step1.status).toBe(OrderStatus.ACCEPTED);

    const step2 = await service.updateOrderStatus(id, { status: OrderStatus.PREPARING });
    expect(step2.status).toBe(OrderStatus.PREPARING);

    const step3 = await service.updateOrderStatus(id, { status: OrderStatus.READY });
    expect(step3.status).toBe(OrderStatus.READY);

    const step4 = await service.updateOrderStatus(id, { status: OrderStatus.COMPLETED });
    expect(step4.status).toBe(OrderStatus.COMPLETED);

    // Invoice must be auto-generated on completion
    expect(invoiceSpy).toHaveBeenCalledTimes(1);
    expect(invoiceSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        orderId: id,
        invoiceNumber: expect.stringMatching(/^INV-\d{4}-\d{6}$/),
      }),
    );
  });

  it('should persist the real stored invoice PDF URL when the invoice PDF pipeline is wired (Sprint 2 Task 5)', async () => {
    const id = 'order-invoice-pdf-001';
    const tenantId = 'tenant-uuid-1111';
    const branchId = 'branch-uuid-1234';

    const makeOrder = (status: OrderStatus): any => ({
      id,
      tenantId,
      branchId,
      orderNumber: 'ORD-2026-12345',
      status,
      subtotal: 50.00,
      taxAmount: 5.00,
      discountAmount: 2.50,
      total: 52.50,
    });

    jest.spyOn(TenantOrderRepository.prototype, 'findById')
      .mockResolvedValueOnce(makeOrder(OrderStatus.PENDING))
      .mockResolvedValueOnce(makeOrder(OrderStatus.ACCEPTED))
      .mockResolvedValueOnce(makeOrder(OrderStatus.PREPARING))
      .mockResolvedValueOnce(makeOrder(OrderStatus.READY));

    jest.spyOn(TenantOrderRepository.prototype, 'update')
      .mockResolvedValueOnce(makeOrder(OrderStatus.ACCEPTED))
      .mockResolvedValueOnce(makeOrder(OrderStatus.PREPARING))
      .mockResolvedValueOnce(makeOrder(OrderStatus.READY))
      .mockResolvedValueOnce(makeOrder(OrderStatus.COMPLETED));

    const invoiceSpy = jest.spyOn(TenantInvoiceRepository.prototype, 'create')
      .mockResolvedValue({ id: 'inv-pdf', invoiceNumber: 'INV-2026-777777', pdfUrl: '/uploads/invoices/t1/INV-2026-777777.pdf' } as any);

    // Wire mock PDF + storage services onto the instance (they are @Optional
    // and absent from the bare OrderService testing module).
    const pdfSpy = jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 mock'));
    const storageSpy = jest.fn().mockResolvedValue({
      storageKey: 'invoices/t1/INV-2026-777777.pdf',
      url: '/uploads/invoices/t1/INV-2026-777777.pdf',
      size: 14,
    });
    (service as unknown as { invoicePdfService: unknown }).invoicePdfService = {
      generate: pdfSpy,
    } as never;
    (service as unknown as { invoiceStorageService: unknown }).invoiceStorageService = {
      storePdf: storageSpy,
    } as never;

    await service.updateOrderStatus(id, { status: OrderStatus.ACCEPTED });
    await service.updateOrderStatus(id, { status: OrderStatus.PREPARING });
    await service.updateOrderStatus(id, { status: OrderStatus.READY });
    await service.updateOrderStatus(id, { status: OrderStatus.COMPLETED });

    expect(pdfSpy).toHaveBeenCalledTimes(1);
    expect(storageSpy).toHaveBeenCalledTimes(1);
    expect(invoiceSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        orderId: id,
        invoiceNumber: expect.stringMatching(/^INV-\d{4}-\d{6}$/),
        pdfUrl: '/uploads/invoices/t1/INV-2026-777777.pdf',
      }),
    );
  });

  // ==========================================
  // 6. Cancel from Every Valid State
  // ==========================================
  it('should allow cancellation from PENDING, ACCEPTED, PREPARING, and READY states', async () => {
    const id = 'order-cancel-test';
    const cancelableStates = [
      OrderStatus.PENDING,
      OrderStatus.ACCEPTED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
    ];

    for (const status of cancelableStates) {
      jest.clearAllMocks();
      jest.spyOn(TenantOrderRepository.prototype, 'findById')
        .mockResolvedValue({ id, status } as any);
      jest.spyOn(TenantOrderRepository.prototype, 'update')
        .mockResolvedValue({ id, status: OrderStatus.CANCELLED } as any);

      const result = await service.cancelOrder(id);
      expect(result.status).toBe(OrderStatus.CANCELLED);
    }
  });

  // ==========================================
  // 7. Reject All Invalid Transitions
  // ==========================================
  it('should reject all invalid state transitions with BadRequestException', async () => {
    const id = 'order-invalid-transitions';

    const invalidTransitions: [OrderStatus, OrderStatus][] = [
      [OrderStatus.PENDING, OrderStatus.PREPARING],
      [OrderStatus.PENDING, OrderStatus.READY],
      [OrderStatus.PENDING, OrderStatus.COMPLETED],
      [OrderStatus.ACCEPTED, OrderStatus.READY],
      [OrderStatus.ACCEPTED, OrderStatus.COMPLETED],
      [OrderStatus.PREPARING, OrderStatus.COMPLETED],
      [OrderStatus.DRAFT, OrderStatus.COMPLETED],
    ];

    for (const [current, next] of invalidTransitions) {
      jest.clearAllMocks();
      jest.spyOn(TenantOrderRepository.prototype, 'findById')
        .mockResolvedValue({ id, status: current } as any);

      await expect(
        service.updateOrderStatus(id, { status: next }),
      ).rejects.toThrow(BadRequestException);
    }
  });

  // ==========================================
  // 8. SMS Notification Triggered on READY Status
  // ==========================================
  it('should trigger SMS notification when order status transitions to READY', async () => {
    const id = 'order-sms-test';
    const smsService = { sendOrderStatusSms: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: require('../notification/sms/sms.service').SmsService, useValue: smsService },
      ],
    }).compile();

    const svc = module.get<OrderService>(OrderService);

    jest.spyOn(TenantOrderRepository.prototype, 'findById')
      .mockResolvedValue({ id, status: OrderStatus.PREPARING, tenantId: 't1', branchId: 'b1', orderNumber: 'ORD-2026-11111' } as any);
    jest.spyOn(TenantOrderRepository.prototype, 'update')
      .mockResolvedValue({ id, status: OrderStatus.READY, tenantId: 't1', branchId: 'b1', orderNumber: 'ORD-2026-11111' } as any);

    await svc.updateOrderStatus(id, { status: OrderStatus.READY });

    // SMS is fire-and-forget, give it a tick
    await new Promise((r) => setTimeout(r, 10));
    expect(smsService.sendOrderStatusSms).toHaveBeenCalled();
  });

  // ==========================================
  // 9. KDS Broadcast Events Fired on Status Changes
  // ==========================================
  it('should broadcast KDS events on status transitions', async () => {
    const id = 'order-kds-test';
    const kdsGateway = { broadcastOrderEvent: jest.fn(), emitTicketCreated: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: require('../kds/kds.gateway').KdsGateway, useValue: kdsGateway },
      ],
    }).compile();

    const svc = module.get<OrderService>(OrderService);

    jest.spyOn(TenantOrderRepository.prototype, 'findById')
      .mockResolvedValue({ id, status: OrderStatus.PENDING, tenantId: 't1', branchId: 'b1', orderNumber: 'ORD-2026-11111' } as any);
    jest.spyOn(TenantOrderRepository.prototype, 'update')
      .mockResolvedValue({ id, status: OrderStatus.ACCEPTED, tenantId: 't1', branchId: 'b1', orderNumber: 'ORD-2026-11111' } as any);

    await svc.updateOrderStatus(id, { status: OrderStatus.ACCEPTED });

    expect(kdsGateway.broadcastOrderEvent).toHaveBeenCalledWith(
      't1', 'b1', 'order.accepted', expect.objectContaining({ id }),
    );
  });

  // ==========================================
  // 10. Cancel Broadcasts order.cancelled Event
  // ==========================================
  it('should broadcast order.cancelled KDS event on cancellation', async () => {
    const id = 'order-cancel-kds';
    const kdsGateway = { broadcastOrderEvent: jest.fn(), emitTicketCreated: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: require('../kds/kds.gateway').KdsGateway, useValue: kdsGateway },
      ],
    }).compile();

    const svc = module.get<OrderService>(OrderService);

    jest.spyOn(TenantOrderRepository.prototype, 'findById')
      .mockResolvedValue({ id, status: OrderStatus.PENDING, tenantId: 't1', branchId: 'b1', orderNumber: 'ORD-2026-22222' } as any);
    jest.spyOn(TenantOrderRepository.prototype, 'update')
      .mockResolvedValue({ id, status: OrderStatus.CANCELLED, tenantId: 't1', branchId: 'b1', orderNumber: 'ORD-2026-22222' } as any);

    await svc.cancelOrder(id);

    expect(kdsGateway.broadcastOrderEvent).toHaveBeenCalledWith(
      't1', 'b1', 'order.cancelled', expect.objectContaining({ id }),
    );
  });
});

// ======================================================================
// Sprint 1, Step 2 — Guest QR Checkout (createGuestOrder),
// Variant Absolute Pricing (DEFECT-A), KDS ticket.created names (DEFECT-B)
// ======================================================================
describe('OrderService — Sprint 1 Step 2 (Guest Checkout / DEFECT-A / DEFECT-B)', () => {
  let service: OrderService;

  const tenantId = 'tenant-uuid-1111';
  const branchId = 'branch-uuid-1234';
  const productId = 'prod-uuid-999';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrderService],
    }).compile();

    service = module.get<OrderService>(OrderService);
    jest.clearAllMocks();
  });

  function mockBasePricingFixtures(taxPercentage = 15) {
    jest.spyOn(TenantBranchRepository.prototype, 'findById').mockResolvedValue({
      id: branchId,
      tenantId,
      restaurantId: 'rest-uuid-999',
    } as any);
    jest.spyOn(TenantRestaurantRepository.prototype, 'findById').mockResolvedValue({
      id: 'rest-uuid-999',
      taxPercentage: taxPercentage as any,
    } as any);
    jest.spyOn(TenantProductRepository.prototype, 'findById').mockResolvedValue({
      id: productId,
      basePrice: 10.00 as any,
      isAvailable: true,
    } as any);
    // R6 parity gate (2026-07-30): createGuestOrder now enforces tenant status
    // after scan resolution — default fixture: ordering allowed (ACTIVE).
    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({ status: 'ACTIVE' } as any);
  }

  function mockCapturingTransaction(orderResult: Record<string, unknown>) {
    const createMock = jest.fn().mockResolvedValue(orderResult);
    const txMock = {
      order: { create: createMock },
      kitchenQueue: {
        create: jest.fn().mockResolvedValue({ id: 'kq-1', ticketNumber: '001', priority: 'NORMAL' }),
      },
      discount: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(txMock));
    return createMock;
  }

  // ==========================================
  // G1. Valid guest token: branch/table forced server-side (DOC-005 4.6)
  // ==========================================
  it('guest checkout with a valid qrCodeToken delegates to checkout with server-authoritative branch/table binding', async () => {
    const table = { id: 'tbl-9', tenantId, branchId, number: 'T-9' };
    jest.spyOn(TenantTableRepository.prototype, 'findByQrCodeToken').mockResolvedValue(table as any);

    mockBasePricingFixtures(0);
    const createMock = mockCapturingTransaction({
      id: 'order-g1',
      orderNumber: 'ORD-2026-12345',
      subtotal: 10.00,
      taxAmount: 0,
      total: 10.00,
    });

    const createDto = {
      branchId, // as resolved by the Step-1 table-context endpoint
      type: OrderType.DINE_IN,
      items: [{ productId, quantity: 1 }],
      paymentMethod: PaymentMethodType.CASH,
      qrCodeToken: 'qr-token-abc',
      // no tableId supplied by the guest — must be forced from the token
    };

    const result = await service.createGuestOrder(createDto, tenantId);

    expect(result.id).toBe('order-g1');
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId,
          branchId,
          tableId: 'tbl-9',
        }),
      }),
    );
  });

  // ==========================================
  // G2. Unknown token → uniform 404 (no existence oracle)
  // ==========================================
  it('guest checkout with an unknown qrCodeToken throws NotFoundException uniformly', async () => {
    jest.spyOn(TenantTableRepository.prototype, 'findByQrCodeToken').mockResolvedValue(null);

    const createDto = {
      branchId,
      type: OrderType.DINE_IN,
      items: [{ productId, quantity: 1 }],
      paymentMethod: PaymentMethodType.CASH,
      qrCodeToken: 'forged-token',
    };

    await expect(service.createGuestOrder(createDto, tenantId)).rejects.toThrow(NotFoundException);
    await expect(service.createGuestOrder(createDto, tenantId)).rejects.toThrow('could not be resolved');
  });

  // ==========================================
  // G3. Missing token → 400
  // ==========================================
  it('guest checkout without a qrCodeToken throws BadRequestException', async () => {
    const createDto = {
      branchId,
      type: OrderType.DINE_IN,
      items: [{ productId, quantity: 1 }],
      paymentMethod: PaymentMethodType.CASH,
    };

    await expect(service.createGuestOrder(createDto as any, tenantId)).rejects.toThrow(BadRequestException);
  });

  // ==========================================
  // G4. Explicit branchId conflicting with the token table → 400 (DOC-005 4.6 mismatch rejection)
  // ==========================================
  it('guest checkout with a branchId that mismatches the token table is rejected', async () => {
    jest.spyOn(TenantTableRepository.prototype, 'findByQrCodeToken').mockResolvedValue({
      id: 'tbl-9',
      tenantId,
      branchId: 'branch-A',
      number: 'T-9',
    } as any);

    const createDto = {
      branchId: 'branch-B',
      type: OrderType.DINE_IN,
      items: [{ productId, quantity: 1 }],
      paymentMethod: PaymentMethodType.CASH,
      qrCodeToken: 'qr-token-abc',
    };

    await expect(service.createGuestOrder(createDto, tenantId)).rejects.toThrow(BadRequestException);
    await expect(service.createGuestOrder(createDto, tenantId)).rejects.toThrow('does not match the scanned table branch');
  });

  // ==========================================
  // G5. Explicit tableId conflicting with the token table → 400
  // ==========================================
  it('guest checkout with a tableId that mismatches the token table is rejected', async () => {
    jest.spyOn(TenantTableRepository.prototype, 'findByQrCodeToken').mockResolvedValue({
      id: 'tbl-9',
      tenantId,
      branchId,
      number: 'T-9',
    } as any);

    const createDto = {
      branchId,
      tableId: 'tbl-7',
      type: OrderType.DINE_IN,
      items: [{ productId, quantity: 1 }],
      paymentMethod: PaymentMethodType.CASH,
      qrCodeToken: 'qr-token-abc',
    };

    await expect(service.createGuestOrder(createDto, tenantId)).rejects.toThrow(BadRequestException);
  });

  // ==========================================
  // G6. R6 (2026-07-30): tenant UNPAID/CANCELED → guest checkout parity gate
  // ==========================================
  it('guest checkout is forbidden when tenant status is UNPAID or CANCELED (R6 parity gate, DOC-001 1.10)', async () => {
    jest.spyOn(TenantTableRepository.prototype, 'findByQrCodeToken').mockResolvedValue({
      id: 'tbl-9',
      tenantId,
      branchId,
      number: 'T-9',
    } as any);

    const createDto = {
      branchId,
      type: OrderType.DINE_IN,
      items: [{ productId, quantity: 1 }],
      paymentMethod: PaymentMethodType.CASH,
      qrCodeToken: 'qr-token-abc',
    };

    for (const status of ['UNPAID', 'CANCELED']) {
      jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({ status } as any);
      await expect(service.createGuestOrder(createDto, tenantId)).rejects.toThrow(ForbiddenException);
      await expect(service.createGuestOrder(createDto, tenantId)).rejects.toThrow(
        'Online ordering is temporarily unavailable',
      );
    }
  });

  // ==========================================
  // A1. DEFECT-A: variant absolute price override (DOC-005 4.3 Condition C)
  // ==========================================
  it('checkout with a variant applies the variant absolute price, replacing base price and skipping size adjustments', async () => {
    mockBasePricingFixtures(15);
    jest.spyOn(prisma.productVariant, 'findFirst').mockResolvedValue({
      id: 'var-1',
      productId,
      name: 'Double Cheese',
      price: 22.50 as any,
      stockQuantity: 7,
    } as any);
    const sizeSpy = jest.spyOn(TenantProductSizeRepository.prototype, 'findMany');

    const createMock = mockCapturingTransaction({
      id: 'order-a1',
      orderNumber: 'ORD-2026-12345',
      subtotal: 45.00,
      taxAmount: 6.75,
      total: 51.75,
    });

    const createDto = {
      branchId,
      type: OrderType.DINE_IN,
      items: [{ productId, variantId: 'var-1', sizeId: 'size-ignored', quantity: 2 }],
      paymentMethod: PaymentMethodType.CASH,
    };

    await service.createOrder(createDto, tenantId);

    // Variant price is absolute: 22.50 * 2 = 45.00 subtotal, 15% tax = 6.75, total = 51.75
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotal: 45.00,
          taxAmount: 6.75,
          total: 51.75,
        }),
      }),
    );
    // Size path must be skipped entirely when a variant is selected
    expect(sizeSpy).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'size-ignored' }));
  });

  // ==========================================
  // A2. DEFECT-A: out-of-stock variant → 400, no transaction started
  // ==========================================
  it('checkout with an out-of-stock variant throws BadRequestException before any transaction', async () => {
    mockBasePricingFixtures(0);
    jest.spyOn(prisma.productVariant, 'findFirst').mockResolvedValue({
      id: 'var-1',
      productId,
      price: 22.50 as any,
      stockQuantity: 0,
    } as any);
    const txSpy = jest.spyOn(prisma, '$transaction').mockImplementation(async () => {
      throw new Error('transaction must not be reached');
    });

    const createDto = {
      branchId,
      type: OrderType.DINE_IN,
      items: [{ productId, variantId: 'var-1', quantity: 1 }],
      paymentMethod: PaymentMethodType.CASH,
    };

    await expect(service.createOrder(createDto, tenantId)).rejects.toThrow(BadRequestException);
    await expect(service.createOrder(createDto, tenantId)).rejects.toThrow('out of stock');
    expect(txSpy).not.toHaveBeenCalled();
  });

  // ==========================================
  // A3. DEFECT-A: variant belonging to another product → 400
  // ==========================================
  it('checkout with a variant that does not belong to the product throws BadRequestException', async () => {
    mockBasePricingFixtures(0);
    // findFirst scoped by { id, productId } returns nothing for foreign variants
    jest.spyOn(prisma.productVariant, 'findFirst').mockResolvedValue(null);

    const createDto = {
      branchId,
      type: OrderType.DINE_IN,
      items: [{ productId, variantId: 'var-foreign', quantity: 1 }],
      paymentMethod: PaymentMethodType.CASH,
    };

    await expect(service.createOrder(createDto, tenantId)).rejects.toThrow(BadRequestException);
    await expect(service.createOrder(createDto, tenantId)).rejects.toThrow('is invalid for product');
  });

  // ==========================================
  // B1. DEFECT-B: ticket.created carries resolved product/size/addon names
  // ==========================================
  it('emits ticket.created with resolved product, size and addon names (never "Unknown Product")', async () => {
    const kdsGateway = { broadcastOrderEvent: jest.fn(), emitTicketCreated: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: require('../kds/kds.gateway').KdsGateway, useValue: kdsGateway },
      ],
    }).compile();
    const svc = module.get<OrderService>(OrderService);

    mockBasePricingFixtures(0);
    mockCapturingTransaction({
      id: 'order-b1',
      orderNumber: 'ORD-2026-12345',
      subtotal: 10.00,
      taxAmount: 0,
      total: 10.00,
    });
    jest.spyOn(prisma.orderItem, 'findMany').mockResolvedValue([
      {
        id: 'item-1',
        quantity: 2,
        cookingStatus: 'PENDING',
        product: { name: 'Zinger Burger' },
        size: { name: 'Large' },
        orderItemAddons: [
          { addonItem: { name: 'Extra Cheese' } },
          { addonItem: { name: 'Spicy Sauce' } },
        ],
      },
    ] as any);

    await svc.createOrder(
      {
        branchId,
        type: OrderType.DINE_IN,
        items: [{ productId, quantity: 2 }],
        paymentMethod: PaymentMethodType.CASH,
      },
      tenantId,
    );

    expect(kdsGateway.emitTicketCreated).toHaveBeenCalledWith(
      tenantId,
      branchId,
      expect.objectContaining({
        ticketId: 'order-b1',
        // server-generated ORD-YYYY-NNNNN; only the last 3 digits ride the ticket
        ticketNumber: expect.stringMatching(/^\d{3}$/),
        priority: 'NORMAL',
        items: [
          expect.objectContaining({
            orderItemId: 'item-1',
            name: 'Zinger Burger',
            quantity: 2,
            size: 'Large',
            addons: ['Extra Cheese', 'Spicy Sauce'],
          }),
        ],
      }),
    );
  });

  // ==========================================
  // B2. DEFECT-B: KDS name-resolution failure never fails the checkout
  // ==========================================
  it('still returns the created order if KDS name resolution fails (broadcast is best-effort)', async () => {
    const kdsGateway = { broadcastOrderEvent: jest.fn(), emitTicketCreated: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: require('../kds/kds.gateway').KdsGateway, useValue: kdsGateway },
      ],
    }).compile();
    const svc = module.get<OrderService>(OrderService);

    mockBasePricingFixtures(0);
    mockCapturingTransaction({
      id: 'order-b2',
      orderNumber: 'ORD-2026-12345',
      subtotal: 10.00,
      taxAmount: 0,
      total: 10.00,
    });
    jest.spyOn(prisma.orderItem, 'findMany').mockRejectedValue(new Error('read replica lag'));

    const result = await svc.createOrder(
      {
        branchId,
        type: OrderType.DINE_IN,
        items: [{ productId, quantity: 1 }],
        paymentMethod: PaymentMethodType.CASH,
      },
      tenantId,
    );

    expect(result.id).toBe('order-b2');
    expect(kdsGateway.emitTicketCreated).not.toHaveBeenCalled();
    // Legacy order.created alias is dispatched independently and still fires
    expect(kdsGateway.broadcastOrderEvent).toHaveBeenCalledWith(
      tenantId, branchId, 'order.created', expect.objectContaining({ id: 'order-b2' }),
    );
  });
});
