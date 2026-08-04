import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../app.module';
import { TenantService } from '../tenant/tenant.service';
import { BranchService } from '../branch/branch.service';
import { MenuService } from '../menu/menu.service';
import { OrderService } from '../order/order.service';
import { CacheService } from './cache/cache.service';
import { OrderType, PaymentMethodType, OrderStatus } from '@zayjar/types';
import { dbTenantContext, prisma } from '@zayjar/db';

// Mocking argon2 C++ native modules to prevent Jest V8 multithreaded segmentation faults
jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock-argon2-hash'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

describe('Zayjar Platform End-to-End API Verification (TSK-2.0)', () => {
  let app: INestApplication;
  let tenantService: TenantService;
  let branchService: BranchService;
  let menuService: MenuService;
  let orderService: OrderService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CacheService)
      .useValue({
        get: jest.fn().mockImplementation((_key, fetchFn) => fetchFn()),
        set: jest.fn().mockResolvedValue(undefined),
        isCacheActive: () => false,
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    tenantService = moduleFixture.get<TenantService>(TenantService);
    branchService = moduleFixture.get<BranchService>(BranchService);
    menuService = moduleFixture.get<MenuService>(MenuService);
    orderService = moduleFixture.get<OrderService>(OrderService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  // ==========================================
  // VERIFICATION 1: Tenant Onboarding Workflow
  // ==========================================
  it('E2E Verification 1: Tenant Onboarding', async () => {
    const txMock = {
      tenant: { create: jest.fn().mockResolvedValue({ id: 't1', name: 'Gourmet LLC', subdomain: 'gourmet', status: 'TRIALING' }) },
      subscription: { create: jest.fn().mockResolvedValue({}) },
      user: { create: jest.fn().mockResolvedValue({ id: 'u1', email: 'owner@gourmet.com' }) },
      role: {
        create: jest.fn().mockResolvedValue({ id: 'r1' }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'r-canonical',
          rolePermissions: [
            { permissionId: 'p-branch-read' },
            { permissionId: 'p-product-read' },
            { permissionId: 'p-order-create' },
          ],
        }),
      },
      userRole: { create: jest.fn().mockResolvedValue({}) },
      rolePermission: { createMany: jest.fn().mockResolvedValue({ count: 3 }) },
      restaurant: { create: jest.fn().mockResolvedValue({ id: 'rest1' }) },
      branch: { create: jest.fn().mockResolvedValue({ id: 'b1', name: 'Main Branch' }) },
    };

    jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(txMock));
    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue(null);
    // FIX(R7): hermeticize the cross-tenant owner-email existence check
    // (prisma.user.findFirst) — mirrors the subdomain availability mock above;
    // every other DB touch in this test is already mocked.
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);

    const result = await tenantService.onboard({
      companyName: 'Gourmet LLC',
      subdomain: 'gourmet',
      ownerFirstName: 'John',
      ownerLastName: 'Doe',
      ownerEmail: 'owner@gourmet.com',
      ownerPassword: 'Password123!',
      planId: 'gold-plan',
    });

    expect(result.tenant.id).toBe('t1');
    expect(result.owner.id).toBe('u1');
    expect(result.branch.id).toBe('b1');
    // RT-ONB-002: the onboarded owner role inherits the canonical
    // RESTAURANT_OWNER permission set (excluding the just-created role).
    expect(txMock.role.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: 'RESTAURANT_OWNER', NOT: { id: 'r1' } } }),
    );
    expect(txMock.rolePermission.createMany).toHaveBeenCalledWith({
      data: [
        { roleId: 'r1', permissionId: 'p-branch-read' },
        { roleId: 'r1', permissionId: 'p-product-read' },
        { roleId: 'r1', permissionId: 'p-order-create' },
      ],
    });
  });

  // ==========================================
  // VERIFICATION 2: Branch & Seating Table API
  // ==========================================
  it('E2E Verification 2: Branch & Seating Table CRUD with secure QR tokens', async () => {
    const tenantId = 't1';
    const branchId = 'b1';

    // Mock DB lookups
    const branchSpy = jest.spyOn(TenantBranchRepository.prototype, 'findById')
      .mockResolvedValue({ id: branchId, tenantId, restaurantId: 'rest1' } as any);
    const branchListSpy = jest.spyOn(TenantBranchRepository.prototype, 'findMany')
      .mockResolvedValue([{ id: branchId, name: 'Main Branch' } as any]);
    const tableSpy = jest.spyOn(TenantTableRepository.prototype, 'create')
      .mockImplementation((data) => Promise.resolve(data as any));

    await dbTenantContext.run({ tenantId }, async () => {
      // Create and list branches
      const branches = await branchService.getBranches();
      expect(branches.length).toBe(1);
      expect(branchListSpy).toHaveBeenCalled();

      // Create dining tables
      const table = await branchService.createTable({
        branchId,
        number: 'Table-14',
        seatingCapacity: 4,
      });

      expect(table.branchId).toBe(branchId);
      expect(table.number).toBe('Table-14');
      expect(table.qrCodeToken).toBeDefined();
      expect(table.qrCodeToken.length).toBe(64); // Confirms SHA-256 HMAC token generation

      expect(branchSpy).toHaveBeenCalledWith(branchId);
      expect(tableSpy).toHaveBeenCalled();
    });
  });

  // ==========================================
  // VERIFICATION 3: Menu & Catalog Engine API
  // ==========================================
  it('E2E Verification 3: Menu Catalog Setup', async () => {
    const tenantId = 't1';
    const categoryId = 'cat1';
    const productId = 'prod1';

    // AUDIT-014 DEFECT-N: createCategory now validates the parent brand before
    // inserting — a foreign restaurantId previously reached Postgres and
    // surfaced as an unhandled FK violation (HTTP 500). Without this spy the
    // lookup falls through to real Prisma and fails on a missing DATABASE_URL.
    jest.spyOn(TenantRestaurantRepository.prototype, 'findById')
      .mockResolvedValue({ id: 'rest1', name: 'E2E Brand' } as any);

    const catSpy = jest.spyOn(TenantCategoryRepository.prototype, 'create')
      .mockResolvedValue({ id: categoryId, name: 'Premium Craft Burgers' } as any);
    const prodSpy = jest.spyOn(TenantProductRepository.prototype, 'create')
      .mockResolvedValue({ id: productId, name: 'Truffle Smash Burger', basePrice: 14.50 as any } as any);

    await dbTenantContext.run({ tenantId }, async () => {
      const category = await menuService.createCategory({
        restaurantId: 'rest1',
        name: 'Premium Craft Burgers',
        sortOrder: 1,
      });

      const product = await menuService.createProduct({
        categoryId,
        name: 'Truffle Smash Burger',
        basePrice: 14.50,
      });

      expect(category.id).toBe(categoryId);
      expect(product.id).toBe(productId);
      expect(catSpy).toHaveBeenCalled();
      expect(prodSpy).toHaveBeenCalled();
    });
  });

  // ==========================================
  // VERIFICATION 4: Checkout & Invoicing Subsystem API
  // ==========================================
  it('E2E Verification 4: Order checkout with server-side totals and automatic invoicing', async () => {
    const tenantId = 't1';
    const branchId = 'b1';
    const productId = 'prod1';

    // A. Mock Branch and Restaurant (10% tax)
    jest.spyOn(TenantBranchRepository.prototype, 'findById').mockResolvedValue({
      id: branchId,
      tenantId,
      restaurantId: 'rest1',
    } as any);
    jest.spyOn(TenantRestaurantRepository.prototype, 'findById').mockResolvedValue({
      id: 'rest1',
      taxPercentage: 10.00 as any,
    } as any);

    // B. Mock Product ($15.00 basePrice)
    jest.spyOn(TenantProductRepository.prototype, 'findById').mockResolvedValue({
      id: productId,
      basePrice: 15.00 as any,
      isAvailable: true,
    } as any);

    // C. Mock transaction result
    const mockOrderResult = {
      id: 'order-1',
      subtotal: 30.00, // 15.00 * 2 quantity = 30.00
      taxAmount: 3.00,  // 30.00 * 10% = 3.00
      total: 33.00,     // 30.00 + 3.00 = 33.00
      status: OrderStatus.PENDING,
    };
    jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb({
      order: { create: jest.fn().mockResolvedValue(mockOrderResult) },
      kitchenQueue: { create: jest.fn().mockResolvedValue({ id: 'kq-1', ticketNumber: '999', priority: 'NORMAL' }) },
    }));

    const createDto = {
      branchId,
      type: OrderType.DINE_IN,
      items: [{ productId, quantity: 2 }],
      paymentMethod: PaymentMethodType.CASH,
    };

    // Act Checkout
    const result = await orderService.createOrder(createDto, tenantId);

    // Assert calculations
    expect(result.subtotal).toBe(30.00);
    expect(result.taxAmount).toBe(3.00);
    expect(result.total).toBe(33.00);

    // D. Mock Status updates & Invoice creation
    jest.spyOn(TenantOrderRepository.prototype, 'findById').mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.READY,
      tenantId,
    } as any);
    const updateSpy = jest.spyOn(TenantOrderRepository.prototype, 'update').mockResolvedValue({
      id: 'order-1',
      tenantId,
      status: OrderStatus.COMPLETED,
    } as any);
    const invoiceSpy = jest.spyOn(TenantInvoiceRepository.prototype, 'create').mockResolvedValue({
      id: 'inv-1',
      invoiceNumber: 'INV-2026-999',
    } as any);

    // Update to completed
    const updated = await orderService.updateOrderStatus('order-1', { status: OrderStatus.COMPLETED });
    expect(updated.status).toBe(OrderStatus.COMPLETED);
    expect(updateSpy).toHaveBeenCalledWith('order-1', { status: OrderStatus.COMPLETED });
    expect(invoiceSpy).toHaveBeenCalled(); // Confirms automatic invoice creation
  });

  // ==========================================
  // VERIFICATION 5: Fail-Safe Security Context Boundaries
  // ==========================================
  it('E2E Verification 5: Tenant Isolation Boundaries', async () => {
    // Calling scoped repository methods outside any running context throws immediate fail-safe block
    await expect(
      branchService.getBranches()
    ).rejects.toThrow(/Fail-Safe Block: Access denied due to missing or unresolved tenant context/);
  });
});

// Import repos to ensure jest spies map correctly
import {
  TenantBranchRepository,
  TenantTableRepository,
  TenantCategoryRepository,
  TenantProductRepository,
  TenantOrderRepository,
  TenantInvoiceRepository,
  TenantRestaurantRepository,
} from '@zayjar/db';
