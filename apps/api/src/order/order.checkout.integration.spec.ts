import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, NestModule, MiddlewareConsumer } from '@nestjs/common';
import request from 'supertest';
import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { PublicOrderController } from './public-order.controller';
import { OrderService } from './order.service';
import { TenantContextMiddleware } from '../common/middleware/tenant-context.middleware';
import { MockJwtAuthGuard, MockRbacPermissionGuard, MockRateLimitGuard } from '../common/test-helpers';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RateLimitGuard } from '../common/rate-limit/rate-limit.guard';
import { CacheService } from '../common/cache/cache.service';
import {
  TenantBranchRepository,
  TenantProductRepository,
  TenantProductSizeRepository,
  TenantAddonItemRepository,
  TenantRestaurantRepository,
  TenantTableRepository,
  prisma,
} from '@zayjar/db';
import { OrderType, PaymentMethodType } from '@zayjar/types';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock-argon2-hash'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

const TENANT_ID = 'tenant-integ-001';
const BRANCH_ID = '4a9b5ff2-988a-42aa-b8d9-453baf673507';
const RESTAURANT_ID = 'rest-integ-001';
const PRODUCT_ID = '31335e6c-65fd-4502-9fd8-2d077c6dc481';
const SIZE_ID = '929a0309-5682-4d62-accc-504649ffb97c';
const ADDON_ID = 'cd99b212-0ac2-4c23-9336-c86ad3a5836e';

function mockBranch() {
  return jest.spyOn(TenantBranchRepository.prototype, 'findById').mockResolvedValue({
    id: BRANCH_ID,
    tenantId: TENANT_ID,
    restaurantId: RESTAURANT_ID,
  } as any);
}

function mockRestaurant(taxPct = 10) {
  return jest.spyOn(TenantRestaurantRepository.prototype, 'findById').mockResolvedValue({
    id: RESTAURANT_ID,
    taxPercentage: taxPct,
  } as any);
}

function mockProduct(basePrice = 20, isAvailable = true) {
  return jest.spyOn(TenantProductRepository.prototype, 'findById').mockResolvedValue({
    id: PRODUCT_ID,
    basePrice,
    isAvailable,
  } as any);
}

function mockSize(priceAdjustment = 5) {
  return jest.spyOn(TenantProductSizeRepository.prototype, 'findMany').mockResolvedValue([
    { id: SIZE_ID, productId: PRODUCT_ID, priceAdjustment } as any,
  ]);
}

function mockAddon(price = 3, isAvailable = true) {
  return jest.spyOn(TenantAddonItemRepository.prototype, 'findMany').mockResolvedValue([
    { id: ADDON_ID, price, isAvailable } as any,
  ]);
}

function mockTransaction(orderResult: any, discountRow: any = null) {
  const txMock = {
    order: {
      create: jest.fn().mockResolvedValue(orderResult),
    },
    kitchenQueue: {
      create: jest.fn().mockResolvedValue({ id: 'kq-1', ticketNumber: '001', priority: 'NORMAL' }),
    },
    discount: {
      findUnique: jest.fn().mockResolvedValue(discountRow),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  return jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(txMock));
}

function baseOrderResult(overrides: Partial<any> = {}) {
  return {
    id: '54c6eb5d-8cdb-4ec1-b69e-f5ba079b2e9c',
    orderNumber: 'ORD-2026-12345',
    tenantId: TENANT_ID,
    branchId: BRANCH_ID,
    tableId: null,
    type: OrderType.DINE_IN,
    paymentMethod: PaymentMethodType.CASH,
    status: 'PENDING',
    subtotal: 48.00,
    taxAmount: 4.80,
    discountAmount: 0,
    total: 52.80,
    specialNotes: null,
    orderItems: [
      {
        id: 'item-1',
        productId: PRODUCT_ID,
        sizeId: SIZE_ID,
        variantId: null,
        quantity: 2,
        unitPrice: 25,
        totalPrice: 56,
        cookingStatus: 'PENDING',
        orderItemAddons: [
          { id: '71d9bbca-b2e3-4729-9d86-e71196853697', addonItemId: ADDON_ID, price: 3 },
        ],
      },
    ],
    ...overrides,
  };
}

const mockCacheService = {
  get: jest.fn().mockImplementation((_key: string, fetchFn: () => Promise<any>) => fetchFn()),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  flush: jest.fn().mockResolvedValue(undefined),
  isCacheActive: () => false,
};

@Module({
  controllers: [OrderController, PublicOrderController],
  providers: [
    OrderService,
    { provide: CacheService, useValue: mockCacheService },
  ],
})
class TestOrderModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantContextMiddleware).forRoutes('api/v1/orders', 'api/v1/public');
  }
}

describe('Order Checkout HTTP Integration Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestOrderModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockJwtAuthGuard)
      .overrideGuard(RbacPermissionGuard)
      .useClass(MockRbacPermissionGuard)
      .overrideGuard(RateLimitGuard)
      .useClass(MockRateLimitGuard)
      .compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  const checkoutPayload = (overrides: Record<string, any> = {}) => ({
    branchId: BRANCH_ID,
    type: OrderType.DINE_IN,
    items: [
      {
        productId: PRODUCT_ID,
        sizeId: SIZE_ID,
        quantity: 2,
        addons: [{ addonItemId: ADDON_ID }],
      },
    ],
    paymentMethod: PaymentMethodType.CASH,
    ...overrides,
  });

  // ==========================================
  // 1. Successful Checkout (201 Created)
  // ==========================================
  it('POST /api/v1/orders/checkout — valid payload returns 201 with order + nested items', async () => {
    mockBranch();
    mockRestaurant(10);
    mockProduct(20);
    mockSize(5);
    mockAddon(3);
    mockTransaction(baseOrderResult());

    const res = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send(checkoutPayload());

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('54c6eb5d-8cdb-4ec1-b69e-f5ba079b2e9c');
    expect(res.body.orderNumber).toMatch(/^ORD-\d{4}-\d{5}$/);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.branchId).toBe(BRANCH_ID);
    // Sprint 2 Task 3: the paymentMethod sent in the payload is now persisted
    // on the order and echoed back in the response (was previously dropped).
    expect(res.body.paymentMethod).toBe(PaymentMethodType.CASH);
    expect(Array.isArray(res.body.orderItems)).toBe(true);
    expect(res.body.orderItems[0].orderItemAddons).toBeDefined();
  });

  // ==========================================
  // 1b. Discount Engine (Sprint 2 Task 4)
  // ==========================================
  it('POST /api/v1/orders/checkout — valid discountCode applies the discount and persists it', async () => {
    mockBranch();
    mockRestaurant(10);
    mockProduct(20);
    mockSize(5);
    mockAddon(3);

    // 10% PERCENTAGE discount; base order subtotal is 48.00 → 4.80 discount.
    mockTransaction(
      baseOrderResult({ discountAmount: 4.80, discountId: 'disc-1', discountCode: 'SAVE10' }),
      { id: 'disc-1', type: 'PERCENTAGE', value: 10, active: true, validFrom: null, validTo: null, usageLimit: null, usageCount: 0 },
    );

    const res = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send(checkoutPayload({ discountCode: 'SAVE10' }));

    expect(res.status).toBe(201);
    expect(res.body.discountAmount).toBe(4.80);
    expect(res.body.discountCode).toBe('SAVE10');
    expect(res.body.discountId).toBe('disc-1');
  });

  it('POST /api/v1/orders/checkout — invalid discountCode returns 400 with the uniform message', async () => {
    mockBranch();
    mockRestaurant(10);
    mockProduct(20);
    mockSize(5);
    mockAddon(3);
    // discountRow defaults to null → resolve fails → checkout rejected.
    mockTransaction(baseOrderResult());

    const res = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send(checkoutPayload({ discountCode: 'NOPE' }));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('The discount code is invalid or expired.');
  });

  // ==========================================
  // 2. Server-Side Price Calculation
  // ==========================================
  it('POST /api/v1/orders/checkout — server-side totals override any client prices', async () => {
    mockBranch();
    mockRestaurant(10);
    mockProduct(20);
    mockSize(5);
    mockAddon(3);

    mockTransaction({
      ...baseOrderResult(),
      subtotal: 56.00,
      taxAmount: 5.60,
      total: 61.60,
      orderItems: [
        {
          id: 'item-1',
          productId: PRODUCT_ID,
          sizeId: SIZE_ID,
          quantity: 2,
          unitPrice: 28,
          totalPrice: 56,
          orderItemAddons: [{ id: '71d9bbca-b2e3-4729-9d86-e71196853697', addonItemId: ADDON_ID, price: 3 }],
        },
      ],
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send(checkoutPayload());

    expect(res.status).toBe(201);
    expect(res.body.subtotal).toBe(56.00);
    expect(res.body.taxAmount).toBe(5.60);
    expect(res.body.total).toBe(61.60);

    const txSpy = prisma.$transaction as jest.Mock;
    expect(txSpy).toHaveBeenCalled();
  });

  // ==========================================
  // 3. DTO Validation — Missing branchId
  // ==========================================
  it('POST /api/v1/orders/checkout — missing branchId returns 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send({
        type: OrderType.DINE_IN,
        items: [{ productId: 'ae0a448c-f913-4178-8fea-6caec69f6835', quantity: 1 }],
        paymentMethod: PaymentMethodType.CASH,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toEqual(
      expect.arrayContaining([expect.stringContaining('branchId')]),
    );
  });

  // ==========================================
  // 4. DTO Validation — Empty items array
  // ==========================================
  it('POST /api/v1/orders/checkout — empty items array returns 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send({
        branchId: BRANCH_ID,
        type: OrderType.DINE_IN,
        items: [],
        paymentMethod: PaymentMethodType.CASH,
      });

    expect(res.status).toBe(400);
  });

  // ==========================================
  // 5. DTO Validation — Invalid OrderType enum
  // ==========================================
  it('POST /api/v1/orders/checkout — invalid type enum returns 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send({
        branchId: BRANCH_ID,
        type: 'INVALID_TYPE',
        items: [{ productId: 'ae0a448c-f913-4178-8fea-6caec69f6835', quantity: 1 }],
        paymentMethod: PaymentMethodType.CASH,
      });

    expect(res.status).toBe(400);
  });

  // ==========================================
  // 6. DTO Validation — Invalid PaymentMethod enum
  // ==========================================
  it('POST /api/v1/orders/checkout — invalid paymentMethod returns 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send({
        branchId: BRANCH_ID,
        type: OrderType.DINE_IN,
        items: [{ productId: 'ae0a448c-f913-4178-8fea-6caec69f6835', quantity: 1 }],
        paymentMethod: 'BITCOIN',
      });

    expect(res.status).toBe(400);
  });

  // ==========================================
  // 7. DTO Validation — quantity < 1
  // ==========================================
  it('POST /api/v1/orders/checkout — quantity < 1 returns 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send({
        branchId: BRANCH_ID,
        type: OrderType.DINE_IN,
        items: [{ productId: 'ae0a448c-f913-4178-8fea-6caec69f6835', quantity: 0 }],
        paymentMethod: PaymentMethodType.CASH,
      });

    expect(res.status).toBe(400);
  });

  // ==========================================
  // 8. Missing X-Tenant-ID header → 403
  // ==========================================
  it('POST /api/v1/orders/checkout — missing X-Tenant-ID header returns 403', async () => {
    mockBranch();
    mockRestaurant();
    mockProduct();

    // No X-Tenant-ID → the middleware resolves tenancy from the Host
    // (custom-domain branch). Simulate the DB answering "no such domain"
    // (cache → null) so the tenant fail-safe returns 403 — the verified
    // runtime contract — instead of erroring inside the real prisma lookup
    // (no database in unit context → generic 404 wrap).
    mockCacheService.get.mockImplementation(() => Promise.resolve(null));

    const res = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .send(checkoutPayload());

    expect(res.status).toBe(403);
  });

  // ==========================================
  // 9. Nonexistent Branch → 404
  // ==========================================
  it('POST /api/v1/orders/checkout — nonexistent branch returns 404', async () => {
    jest.spyOn(TenantBranchRepository.prototype, 'findById').mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send(checkoutPayload());

    expect(res.status).toBe(404);
    expect(res.body.message).toEqual(
      expect.stringContaining('branch'),
    );
  });

  // ==========================================
  // 9b. Table validation (AUDIT-007 / DEFECT-G)
  // ==========================================
  // `dto.tableId` used to be written straight onto the order with no lookup.
  // Runtime-proven before the fix: a checkout naming a SOFT-DELETED table
  // returned HTTP 201 and persisted the order against it, which defeats the
  // new DELETE /api/v1/tables/:id endpoint entirely. A table from a different
  // branch was likewise accepted.
  describe('table validation (AUDIT-007 DEFECT-G)', () => {
    const TABLE_ID = 'b7c1f0e1-2c9c-4a2f-9a34-6d5a1b9f0c21';

    it('rejects a soft-deleted / unknown table with 404', async () => {
      mockBranch();
      mockRestaurant(10);
      // findById is tenant-scoped AND filters `deletedAt IS NULL`, so a
      // soft-deleted table resolves to null exactly like an unknown one.
      jest.spyOn(TenantTableRepository.prototype, 'findById').mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/api/v1/orders/checkout')
        .set('X-Tenant-ID', TENANT_ID)
        .send(checkoutPayload({ tableId: TABLE_ID }));

      expect(res.status).toBe(404);
      expect(res.body.message).toEqual(expect.stringContaining('table'));
    });

    it('rejects a table that belongs to a different branch with 400', async () => {
      mockBranch();
      mockRestaurant(10);
      jest.spyOn(TenantTableRepository.prototype, 'findById').mockResolvedValue({
        id: TABLE_ID,
        tenantId: TENANT_ID,
        branchId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        deletedAt: null,
      } as any);

      const res = await request(app.getHttpServer())
        .post('/api/v1/orders/checkout')
        .set('X-Tenant-ID', TENANT_ID)
        .send(checkoutPayload({ tableId: TABLE_ID }));

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(expect.stringContaining('does not belong'));
    });

    it('does not look up a table when the order has no tableId', async () => {
      mockBranch();
      mockRestaurant(10);
      const tableSpy = jest.spyOn(TenantTableRepository.prototype, 'findById');

      await request(app.getHttpServer())
        .post('/api/v1/orders/checkout')
        .set('X-Tenant-ID', TENANT_ID)
        .send(checkoutPayload());

      expect(tableSpy).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // 10. Nonexistent Restaurant → 404
  // ==========================================
  it('POST /api/v1/orders/checkout — missing restaurant returns 404', async () => {
    mockBranch();
    jest.spyOn(TenantRestaurantRepository.prototype, 'findById').mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send(checkoutPayload());

    expect(res.status).toBe(404);
    expect(res.body.message).toEqual(
      expect.stringContaining('restaurant'),
    );
  });

  // ==========================================
  // 11. Unavailable Product → 404
  // ==========================================
  it('POST /api/v1/orders/checkout — unavailable product returns 404', async () => {
    mockBranch();
    mockRestaurant();
    mockProduct(20, false);

    const res = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send(checkoutPayload());

    expect(res.status).toBe(404);
    expect(res.body.message).toEqual(
      expect.stringContaining('unavailable'),
    );
  });

  // ==========================================
  // 12. Nonexistent Product → 404
  // ==========================================
  it('POST /api/v1/orders/checkout — nonexistent product returns 404', async () => {
    mockBranch();
    mockRestaurant();
    jest.spyOn(TenantProductRepository.prototype, 'findById').mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send(checkoutPayload());

    expect(res.status).toBe(404);
  });

  // ==========================================
  // 13. Invalid Size ID → 400
  // ==========================================
  it('POST /api/v1/orders/checkout — invalid size modifier returns 400', async () => {
    mockBranch();
    mockRestaurant();
    mockProduct();
    jest.spyOn(TenantProductSizeRepository.prototype, 'findMany').mockResolvedValue([]);

    const res = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send(checkoutPayload());

    expect(res.status).toBe(400);
    expect(res.body.message).toEqual(
      expect.stringContaining('Sizing modifier'),
    );
  });

  // ==========================================
  // 14. Invalid Addon ID → 400
  // ==========================================
  it('POST /api/v1/orders/checkout — invalid addon returns 400', async () => {
    mockBranch();
    mockRestaurant();
    mockProduct();
    mockSize();
    jest.spyOn(TenantAddonItemRepository.prototype, 'findMany').mockResolvedValue([]);

    const res = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send(checkoutPayload());

    expect(res.status).toBe(400);
    expect(res.body.message).toEqual(
      expect.stringContaining('addon'),
    );
  });

  // ==========================================
  // 15. Unavailable Addon → 400
  // ==========================================
  it('POST /api/v1/orders/checkout — unavailable addon returns 400', async () => {
    mockBranch();
    mockRestaurant();
    mockProduct();
    mockSize();
    jest.spyOn(TenantAddonItemRepository.prototype, 'findMany').mockResolvedValue([
      { id: ADDON_ID, price: 3, isAvailable: false } as any,
    ]);

    const res = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send(checkoutPayload());

    expect(res.status).toBe(400);
    expect(res.body.message).toEqual(
      expect.stringContaining('unavailable'),
    );
  });

  // ==========================================
  // 16. Checkout without size or addons (simple order)
  // ==========================================
  it('POST /api/v1/orders/checkout — simple order without sizes or addons succeeds', async () => {
    mockBranch();
    mockRestaurant(0);
    jest.spyOn(TenantProductRepository.prototype, 'findById').mockResolvedValue({
      id: PRODUCT_ID,
      basePrice: 15,
      isAvailable: true,
    } as any);

    mockTransaction({
      ...baseOrderResult(),
      type: OrderType.TAKE_AWAY,
      subtotal: 30.00,
      taxAmount: 0,
      total: 30.00,
      orderItems: [
        {
          id: 'item-1',
          productId: PRODUCT_ID,
          sizeId: null,
          quantity: 2,
          unitPrice: 15,
          totalPrice: 30,
          orderItemAddons: [],
        },
      ],
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send({
        branchId: BRANCH_ID,
        type: OrderType.TAKE_AWAY,
        items: [{ productId: PRODUCT_ID, quantity: 2 }],
        paymentMethod: PaymentMethodType.CASH,
      });

    expect(res.status).toBe(201);
    expect(res.body.subtotal).toBe(30.00);
    expect(res.body.taxAmount).toBe(0);
    expect(res.body.total).toBe(30.00);
    expect(res.body.type).toBe('TAKE_AWAY');
  });

  // ==========================================
  // 17. Checkout with specialNotes persists through
  // ==========================================
  it('POST /api/v1/orders/checkout — specialNotes included in response', async () => {
    mockBranch();
    mockRestaurant(0);
    mockProduct(10);

    const orderWithNotes = {
      ...baseOrderResult(),
      specialNotes: 'Extra crispy please',
      subtotal: 10.00,
      taxAmount: 0,
      total: 10.00,
    };
    mockTransaction(orderWithNotes);

    const res = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send({
        branchId: BRANCH_ID,
        type: OrderType.DINE_IN,
        specialNotes: 'Extra crispy please',
        items: [{ productId: PRODUCT_ID, quantity: 1 }],
        paymentMethod: PaymentMethodType.CASH,
      });

    expect(res.status).toBe(201);
    expect(res.body.specialNotes).toBe('Extra crispy please');
  });

  // ==========================================
  // 18. Checkout with tableId persists through
  // ==========================================
  it('POST /api/v1/orders/checkout — tableId included in response', async () => {
    mockBranch();
    mockRestaurant(0);
    mockProduct(10);
    // AUDIT-007: a supplied tableId is now validated (tenant-scoped, must be
    // live and belong to the branch) before the order is written.
    jest.spyOn(TenantTableRepository.prototype, 'findById').mockResolvedValue({
      id: '934f51f6-889c-47db-943b-11405ef8e5f0',
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      deletedAt: null,
    } as any);

    const orderWithTable = {
      ...baseOrderResult(),
      tableId: '934f51f6-889c-47db-943b-11405ef8e5f0',
      subtotal: 10.00,
      taxAmount: 0,
      total: 10.00,
    };
    mockTransaction(orderWithTable);

    const res = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send({
        branchId: BRANCH_ID,
        type: OrderType.DINE_IN,
        tableId: '934f51f6-889c-47db-943b-11405ef8e5f0',
        items: [{ productId: PRODUCT_ID, quantity: 1 }],
        paymentMethod: PaymentMethodType.CASH,
      });

    expect(res.status).toBe(201);
    expect(res.body.tableId).toBe('934f51f6-889c-47db-943b-11405ef8e5f0');
  });

  // ==========================================
  // 19. Whitelist rejects unknown fields
  // ==========================================
  it('POST /api/v1/orders/checkout — unknown field in body is rejected (400)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send({
        branchId: BRANCH_ID,
        type: OrderType.DINE_IN,
        items: [{ productId: PRODUCT_ID, quantity: 1 }],
        paymentMethod: PaymentMethodType.CASH,
        injectedField: 'evil',
      });

    expect(res.status).toBe(400);
  });

  // ==========================================
  // 20. Missing type field → 400
  // ==========================================
  it('POST /api/v1/orders/checkout — missing type returns 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send({
        branchId: BRANCH_ID,
        items: [{ productId: PRODUCT_ID, quantity: 1 }],
        paymentMethod: PaymentMethodType.CASH,
      });

    expect(res.status).toBe(400);
  });

  // ==========================================
  // 21. Missing paymentMethod → 400
  // ==========================================
  it('POST /api/v1/orders/checkout — missing paymentMethod returns 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send({
        branchId: BRANCH_ID,
        type: OrderType.DINE_IN,
        items: [{ productId: PRODUCT_ID, quantity: 1 }],
      });

    expect(res.status).toBe(400);
  });

  // ==========================================
  // 22. Multiple items with different products
  // ==========================================
  it('POST /api/v1/orders/checkout — multiple items with different products succeeds', async () => {
    const PRODUCT_ID_2 = '9a159817-e83d-4c03-9918-0ce2e14323b1';

    mockBranch();
    mockRestaurant(10);

    const productSpy = jest.spyOn(TenantProductRepository.prototype, 'findById');
    productSpy.mockResolvedValueOnce({
      id: PRODUCT_ID,
      basePrice: 20,
      isAvailable: true,
    } as any);
    productSpy.mockResolvedValueOnce({
      id: PRODUCT_ID_2,
      basePrice: 12,
      isAvailable: true,
    } as any);

    mockTransaction({
      ...baseOrderResult(),
      subtotal: 62.00,
      taxAmount: 6.20,
      total: 68.20,
      orderItems: [
        {
          id: 'item-1',
          productId: PRODUCT_ID,
          quantity: 2,
          unitPrice: 20,
          totalPrice: 40,
          orderItemAddons: [],
        },
        {
          id: 'item-2',
          productId: PRODUCT_ID_2,
          quantity: 1,
          unitPrice: 12,
          totalPrice: 12,
          orderItemAddons: [],
        },
      ],
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send({
        branchId: BRANCH_ID,
        type: OrderType.DINE_IN,
        items: [
          { productId: PRODUCT_ID, quantity: 2 },
          { productId: PRODUCT_ID_2, quantity: 1 },
        ],
        paymentMethod: PaymentMethodType.CASH,
      });

    expect(res.status).toBe(201);
    expect(res.body.orderItems).toHaveLength(2);
    expect(res.body.subtotal).toBe(62.00);
  });

  // ==========================================
  // 23. Empty body → 400 (all required fields missing)
  // ==========================================
  it('POST /api/v1/orders/checkout — empty body returns 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send({});

    expect(res.status).toBe(400);
  });

  // ======================================================================
  // Sprint 1, Step 2 — Public Guest QR Checkout
  // POST /api/v1/public/orders/checkout (@Public, guest rate tier)
  // ======================================================================
  const GUEST_TABLE = { id: '8befa7db-3382-4f7e-b683-ae678f488af3', tenantId: TENANT_ID, branchId: BRANCH_ID, number: 'T-7' };

  it('P1. guest checkout with a valid qrCodeToken returns 201 and forces server-side branch/table binding', async () => {
    jest.spyOn(TenantTableRepository.prototype, 'findByQrCodeToken').mockResolvedValue(GUEST_TABLE as any);
    // AUDIT-007: createOrder now re-validates the resolved tableId by id
    // (defense in depth — the guest path binds the table from the verified
    // QR token, and the shared pipeline confirms it is still live and
    // belongs to the branch). Without this mock the lookup reaches Prisma.
    jest.spyOn(TenantTableRepository.prototype, 'findById').mockResolvedValue(GUEST_TABLE as any);
    // R6 parity gate (2026-07-30): createGuestOrder enforces tenant status — fixture ACTIVE.
    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({ status: 'ACTIVE' } as any);
    mockBranch();
    mockRestaurant(0);
    mockProduct(10);
    mockSize(5);
    mockAddon(3);

    const createMock = jest.fn().mockResolvedValue({
      ...baseOrderResult(),
      tableId: GUEST_TABLE.id,
      subtotal: 10.00,
      taxAmount: 0,
      total: 10.00,
    });
    jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) =>
      cb({
        order: { create: createMock },
        kitchenQueue: { create: jest.fn().mockResolvedValue({ id: 'kq-1' }) },
      }),
    );

    const res = await request(app.getHttpServer())
      .post('/api/v1/public/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send(checkoutPayload({ qrCodeToken: 'qr-valid-token' }));

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('54c6eb5d-8cdb-4ec1-b69e-f5ba079b2e9c');
    // Branch/table are derived from the verified token, not from the guest body
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          branchId: BRANCH_ID,
          tableId: GUEST_TABLE.id,
        }),
      }),
    );
  });

  it('P2. guest checkout with an unknown qrCodeToken returns a uniform 404 (no existence oracle)', async () => {
    jest.spyOn(TenantTableRepository.prototype, 'findByQrCodeToken').mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .post('/api/v1/public/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send(checkoutPayload({ qrCodeToken: 'qr-forged-token' }));

    expect(res.status).toBe(404);
    expect(res.body.message).toEqual(expect.stringContaining('could not be resolved'));
  });

  it('P3. guest checkout with a branchId mismatching the token table returns 400 (DOC-005 4.6)', async () => {
    jest.spyOn(TenantTableRepository.prototype, 'findByQrCodeToken').mockResolvedValue(GUEST_TABLE as any);
    // AUDIT-007: createOrder now re-validates the resolved tableId by id
    // (defense in depth — the guest path binds the table from the verified
    // QR token, and the shared pipeline confirms it is still live and
    // belongs to the branch). Without this mock the lookup reaches Prisma.
    jest.spyOn(TenantTableRepository.prototype, 'findById').mockResolvedValue(GUEST_TABLE as any);

    const res = await request(app.getHttpServer())
      .post('/api/v1/public/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send(checkoutPayload({ qrCodeToken: 'qr-valid-token', branchId: '6f30b284-2c28-4e87-81c3-c5bb8c275cb9' }));

    expect(res.status).toBe(400);
    expect(res.body.message).toEqual(expect.stringContaining('does not match the scanned table branch'));
  });

  it('P4. guest checkout without a qrCodeToken returns 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send(checkoutPayload());

    expect(res.status).toBe(400);
    expect(res.body.message).toEqual(expect.stringContaining('qrCodeToken'));
  });

  it('P5. guest checkout with a variant applies the absolute variant price override (DEFECT-A)', async () => {
    jest.spyOn(TenantTableRepository.prototype, 'findByQrCodeToken').mockResolvedValue(GUEST_TABLE as any);
    // AUDIT-007: createOrder now re-validates the resolved tableId by id
    // (defense in depth — the guest path binds the table from the verified
    // QR token, and the shared pipeline confirms it is still live and
    // belongs to the branch). Without this mock the lookup reaches Prisma.
    jest.spyOn(TenantTableRepository.prototype, 'findById').mockResolvedValue(GUEST_TABLE as any);
    // R6 parity gate (2026-07-30): createGuestOrder enforces tenant status — fixture ACTIVE.
    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({ status: 'ACTIVE' } as any);
    mockBranch();
    mockRestaurant(10);
    mockProduct(20);
    jest.spyOn(prisma.productVariant, 'findFirst').mockResolvedValue({
      id: '6946e635-e6a6-4086-8e66-c3174934abae',
      productId: PRODUCT_ID,
      price: 30 as any,
      stockQuantity: 5,
    } as any);

    const createMock = jest.fn().mockResolvedValue({
      ...baseOrderResult(),
      tableId: GUEST_TABLE.id,
      subtotal: 60.00,
      taxAmount: 6.00,
      total: 66.00,
    });
    jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) =>
      cb({
        order: { create: createMock },
        kitchenQueue: { create: jest.fn().mockResolvedValue({ id: 'kq-1' }) },
      }),
    );

    const res = await request(app.getHttpServer())
      .post('/api/v1/public/orders/checkout')
      .set('X-Tenant-ID', TENANT_ID)
      .send(checkoutPayload({
        qrCodeToken: 'qr-valid-token',
        items: [{ productId: PRODUCT_ID, variantId: '6946e635-e6a6-4086-8e66-c3174934abae', quantity: 2 }],
      }));

    expect(res.status).toBe(201);
    // Absolute variant pricing (DOC-005 4.3 Condition C): 30.00 * 2 = 60.00, 10% tax = 6.00
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotal: 60.00,
          taxAmount: 6.00,
          total: 66.00,
        }),
      }),
    );
  });
});
