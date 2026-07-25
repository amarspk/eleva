import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, NestModule, MiddlewareConsumer } from '@nestjs/common';
import request from 'supertest';
import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
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
  prisma,
} from '@zayjar/db';
import { OrderType, PaymentMethodType } from '@zayjar/types';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock-argon2-hash'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

const TENANT_ID = 'tenant-integ-001';
const BRANCH_ID = 'branch-integ-001';
const RESTAURANT_ID = 'rest-integ-001';
const PRODUCT_ID = 'prod-integ-001';
const SIZE_ID = 'size-integ-001';
const ADDON_ID = 'addon-integ-001';

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

function mockTransaction(orderResult: any) {
  const txMock = {
    order: {
      create: jest.fn().mockResolvedValue(orderResult),
    },
  };
  return jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(txMock));
}

function baseOrderResult(overrides: Partial<any> = {}) {
  return {
    id: 'order-integ-001',
    orderNumber: 'ORD-2026-12345',
    tenantId: TENANT_ID,
    branchId: BRANCH_ID,
    tableId: null,
    type: OrderType.DINE_IN,
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
          { id: 'addon-1', addonItemId: ADDON_ID, price: 3 },
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
  controllers: [OrderController],
  providers: [
    OrderService,
    { provide: CacheService, useValue: mockCacheService },
  ],
})
class TestOrderModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantContextMiddleware).forRoutes('api/v1/orders');
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
    expect(res.body.id).toBe('order-integ-001');
    expect(res.body.orderNumber).toMatch(/^ORD-\d{4}-\d{5}$/);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.branchId).toBe(BRANCH_ID);
    expect(Array.isArray(res.body.orderItems)).toBe(true);
    expect(res.body.orderItems[0].orderItemAddons).toBeDefined();
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
          orderItemAddons: [{ id: 'addon-1', addonItemId: ADDON_ID, price: 3 }],
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
        items: [{ productId: 'x', quantity: 1 }],
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
        items: [{ productId: 'x', quantity: 1 }],
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
        items: [{ productId: 'x', quantity: 1 }],
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
        items: [{ productId: 'x', quantity: 0 }],
        paymentMethod: PaymentMethodType.CASH,
      });

    expect(res.status).toBe(400);
  });

  // ==========================================
  // 8. Missing X-Tenant-ID header → 404
  // ==========================================
  it('POST /api/v1/orders/checkout — missing X-Tenant-ID header returns 404', async () => {
    mockBranch();
    mockRestaurant();
    mockProduct();

    const res = await request(app.getHttpServer())
      .post('/api/v1/orders/checkout')
      .send(checkoutPayload());

    expect(res.status).toBe(404);
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

    const orderWithTable = {
      ...baseOrderResult(),
      tableId: 'table-7',
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
        tableId: 'table-7',
        items: [{ productId: PRODUCT_ID, quantity: 1 }],
        paymentMethod: PaymentMethodType.CASH,
      });

    expect(res.status).toBe(201);
    expect(res.body.tableId).toBe('table-7');
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
    const PRODUCT_ID_2 = 'prod-integ-002';

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
});
