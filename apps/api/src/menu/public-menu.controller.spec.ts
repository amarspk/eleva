import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PublicMenuController } from './public-menu.controller';
import { PublicMenuService } from './public-menu.service';
import { RateLimitGuard } from '../common/rate-limit/rate-limit.guard';
import { prisma } from '@zayjar/db';

// ==========================================
// Mock @zayjar/db — same factory pattern as kds.service.spec.ts
// ==========================================
jest.mock('@zayjar/db', () => ({
  prisma: {
    table: { findFirst: jest.fn() },
    branch: { findFirst: jest.fn(), findMany: jest.fn() },
    restaurant: { findFirst: jest.fn() },
    tenant: { findUnique: jest.fn() },
    category: { findMany: jest.fn() },
    tenantDesign: { findUnique: jest.fn() },
  },
  dbTenantContext: {
    run: jest.fn((_ctx: unknown, fn: () => Promise<unknown>) => fn()),
  },
}));

const mockPrisma = prisma as unknown as {
  table: { findFirst: jest.Mock };
  branch: { findFirst: jest.Mock; findMany: jest.Mock };
  restaurant: { findFirst: jest.Mock };
  tenant: { findUnique: jest.Mock };
  category: { findMany: jest.Mock };
  tenantDesign: { findUnique: jest.Mock };
};

const TENANT_ID = 'tenant-uuid-1';
const VALID_TOKEN = 'qr-valid-token-abc';
const TABLE_ROW = { id: 'table-1', number: 'T-7', branchId: 'branch-1' };
const BRANCH_ROW = { id: 'branch-1', name: 'Downtown Branch', restaurantId: 'rest-1' };
const RESTAURANT_ROW = { name: 'Gourmet Burgers', currency: 'USD' };
const TENANT_ROW = {
  name: 'Albaik Demo',
  logoUrl: 'https://cdn.example.com/logo.webp',
  bannerUrl: null,
  primaryColor: '#112233',
  secondaryColor: '#FFFFFF',
  status: 'ACTIVE',
};

describe('PublicMenu (QR guest surface)', () => {
  let controller: PublicMenuController;
  let service: PublicMenuService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicMenuController],
      providers: [PublicMenuService],
    })
      .overrideGuard(RateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PublicMenuController>(PublicMenuController);
    service = module.get<PublicMenuService>(PublicMenuService);
    jest.clearAllMocks();

    mockPrisma.table.findFirst.mockResolvedValue(TABLE_ROW);
    mockPrisma.branch.findFirst.mockResolvedValue(BRANCH_ROW);
    mockPrisma.branch.findMany.mockResolvedValue([]);
    mockPrisma.restaurant.findFirst.mockResolvedValue(RESTAURANT_ROW);
    mockPrisma.tenant.findUnique.mockResolvedValue(TENANT_ROW);
    mockPrisma.category.findMany.mockResolvedValue([]);
    mockPrisma.tenantDesign.findUnique.mockResolvedValue(null);
  });

  describe('getTableContext (service)', () => {
    it('resolves table, branch, restaurant and branding for a valid token', async () => {
      const result = await service.getTableContext(VALID_TOKEN, TENANT_ID);

      expect(result.table.number).toBe('T-7');
      expect(result.branch).toEqual({ id: 'branch-1', name: 'Downtown Branch' });
      expect(result.restaurant).toEqual({ name: 'Gourmet Burgers', currency: 'USD' });
      expect(result.tenant.name).toBe('Albaik Demo');
      expect(result.tenant.primaryColor).toBe('#112233');
    });

    it('looks up the table strictly by qrCodeToken with soft-delete exclusion', async () => {
      await service.getTableContext(VALID_TOKEN, TENANT_ID);
      expect(mockPrisma.table.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { qrCodeToken: VALID_TOKEN, deletedAt: null },
        }),
      );
    });

    it('never leaks internal tenant fields onto the public surface', async () => {
      const result = await service.getTableContext(VALID_TOKEN, TENANT_ID);
      const serialized = JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
      expect(serialized.tenant).not.toHaveProperty('stripeCustomerId');
      expect(serialized.tenant).not.toHaveProperty('status');
      expect(serialized).not.toHaveProperty('tenantId');
    });

    it('rejects an unknown token with a uniform 404', async () => {
      mockPrisma.table.findFirst.mockResolvedValue(null);
      await expect(service.getTableContext('qr-wrong-token', TENANT_ID)).rejects.toThrow(NotFoundException);
    });

    it('rejects an empty token with a uniform 404', async () => {
      await expect(service.getTableContext('   ', TENANT_ID)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.table.findFirst).not.toHaveBeenCalled();
    });

    it('rejects when the owning branch is inactive (404, no oracle)', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue(null);
      await expect(service.getTableContext(VALID_TOKEN, TENANT_ID)).rejects.toThrow(NotFoundException);
    });

    it('blocks guests when the subscription is UNPAID (DOC-001 1.10)', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ ...TENANT_ROW, status: 'UNPAID' });
      await expect(service.getTableContext(VALID_TOKEN, TENANT_ID)).rejects.toThrow(ForbiddenException);
    });

    it('blocks guests when the subscription is CANCELED (DOC-001 1.10)', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ ...TENANT_ROW, status: 'CANCELED' });
      await expect(service.getPublicMenu(VALID_TOKEN, TENANT_ID)).rejects.toThrow(ForbiddenException);
    });

    it('allows guests during PAST_DUE grace period', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ ...TENANT_ROW, status: 'PAST_DUE' });
      await expect(service.getTableContext(VALID_TOKEN, TENANT_ID)).resolves.toBeDefined();
    });
  });

  describe('getPublicMenu (service)', () => {
    const menuRows = [
      {
        id: 'cat-1',
        name: 'Burgers',
        products: [
          {
            id: 'prod-1',
            name: 'Smash Burger',
            description: 'Double patty',
            imageUrl: 'https://cdn.example.com/burger.webp',
            basePrice: '14.50',
            calories: 850,
            preparationTime: 15,
            isAvailable: true,
            productSizes: [{ id: 'size-1', name: 'Double', priceAdjustment: '4.00' }],
            productVariants: [{ id: 'var-1', name: 'Spicy', price: '15.50', stockQuantity: 3 }],
            productAddons: [
              {
                id: 'group-1',
                name: 'Extra Sauces',
                minSelections: 0,
                maxSelections: 2,
                addonItems: [{ id: 'addon-1', name: 'Aioli', price: '0.75', isAvailable: true }],
              },
            ],
          },
        ],
      },
      { id: 'cat-2', name: 'Empty Category', products: [] },
    ];

    beforeEach(() => {
      mockPrisma.category.findMany.mockResolvedValue(menuRows);
    });

    it('queries only active, non-deleted categories of the owning restaurant', async () => {
      await service.getPublicMenu(VALID_TOKEN, TENANT_ID);
      expect(mockPrisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { restaurantId: 'rest-1', isActive: true, deletedAt: null },
        }),
      );
    });

    it('bounds the guest menu fan-out on this unauthenticated endpoint', async () => {
      // Production-readiness audit: the query previously had no `take`, so the
      // payload grew linearly with catalogue size — runtime-measured 5 KB at 13
      // products vs 177 KB at 813 products, reachable without credentials.
      await service.getPublicMenu(VALID_TOKEN, TENANT_ID);

      const args = mockPrisma.category.findMany.mock.calls[0][0];
      expect(args.take).toBe(100);
      expect(args.select.products.take).toBe(200);
    });

    it('keeps the full catalog tenant-scoped and limited to active products', async () => {
      await service.getPublicMenu(VALID_TOKEN, TENANT_ID);

      const args = mockPrisma.category.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ restaurantId: 'rest-1', isActive: true, deletedAt: null });
      expect(args.select.products.where).toEqual({ isAvailable: true, deletedAt: null });
    });

    it('returns only the published design projection to public menu clients', async () => {
      mockPrisma.tenantDesign.findUnique.mockResolvedValue({
        published: { sections: [{ id: 'published-featured', type: 'featured' }] },
        draft: { sections: [{ id: 'private-draft', type: 'featured' }] },
      });

      const result = await service.getPublicMenu(VALID_TOKEN, TENANT_ID);

      expect(mockPrisma.tenantDesign.findUnique).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
        select: { published: true },
      });
      expect(JSON.stringify(result.design)).toContain('published-featured');
      expect(JSON.stringify(result.design)).not.toContain('private-draft');
    });

    it('maps the menu into the guest DTO shape with numeric prices and addon options', async () => {
      const result = await service.getPublicMenu(VALID_TOKEN, TENANT_ID);

      expect(result.categories).toHaveLength(1); // empty category filtered out
      const product = result.categories[0].products[0];
      expect(product.basePrice).toBe(14.5);
      expect(typeof product.basePrice).toBe('number');
      expect(product.sizes[0]).toEqual({ id: 'size-1', name: 'Double', priceAdjustment: 4 });
      expect(product.variants[0]).toEqual({ id: 'var-1', name: 'Spicy', price: 15.5, stockQuantity: 3 });
      expect(product.addons[0].name).toBe('Extra Sauces');
      expect(product.addons[0].options).toEqual([{ id: 'addon-1', name: 'Aioli', price: 0.75, isAvailable: true }]);
    });

    it('rejects the menu request when the token is invalid', async () => {
      mockPrisma.table.findFirst.mockResolvedValue(null);
      await expect(service.getPublicMenu('qr-wrong-token', TENANT_ID)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.category.findMany).not.toHaveBeenCalled();
    });
  });

  describe('PublicMenuController (controller wiring)', () => {
    const reqWithTenant = { tenantId: TENANT_ID } as never;

    it('delegates table resolution to the service with the middleware tenant context', async () => {
      const spy = jest.spyOn(service, 'getTableContext');
      const result = await controller.getTableContext(VALID_TOKEN, reqWithTenant);
      expect(spy).toHaveBeenCalledWith(VALID_TOKEN, TENANT_ID);
      expect(result.table.number).toBe('T-7');
    });

    it('delegates menu resolution to the service with the middleware tenant context', async () => {
      const spy = jest.spyOn(service, 'getPublicMenu');
      await controller.getPublicMenu(VALID_TOKEN, reqWithTenant);
      expect(spy).toHaveBeenCalledWith(VALID_TOKEN, TENANT_ID);
    });

    it('fails safe when no tenant context reached the controller', async () => {
      await expect(controller.getPublicMenu(VALID_TOKEN, { tenantId: null } as never)).rejects.toThrow(BadRequestException);
    });
  });

  describe('PublicMenuService.getPublicSite (Phase 4 P1 — token-free restaurant website)', () => {
    const CATEGORY_ROW = {
      id: 'cat-1',
      name: 'Burgers',
      products: [
        {
          id: 'prod-1',
          name: 'Classic Burger',
          description: null,
          imageUrl: 'https://cdn.example.com/burger.webp',
          basePrice: 9.5,
          calories: 700,
          preparationTime: 12,
          isAvailable: true,
          productSizes: [],
          productVariants: [],
          productAddons: [],
        },
      ],
    };

    it('returns tenant branding (incl. social links), restaurant, first branch and menu without a token', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        ...TENANT_ROW,
        branding: { phone: '+966501234567', whatsapp: '+966501234567', instagram: 'albaik', twitter: 'albaik' },
      });
      mockPrisma.restaurant.findFirst.mockResolvedValue({ id: 'rest-1', name: 'Albaik', currency: 'SAR' });
      mockPrisma.branch.findFirst.mockResolvedValue({ id: 'branch-1', name: 'Riyadh', phoneNumber: '+96611', address: 'Olaya' });
      mockPrisma.branch.findMany.mockResolvedValue([{ id: 'branch-1', name: 'Riyadh', phoneNumber: '+96611', address: 'Olaya' }]);
      mockPrisma.category.findMany.mockResolvedValue([CATEGORY_ROW]);
      mockPrisma.tenantDesign.findUnique.mockResolvedValue(null);

      const result = await service.getPublicSite(TENANT_ID);

      expect(result.tenant.social).toEqual({
        phone: '+966501234567',
        whatsapp: '+966501234567',
        instagram: 'albaik',
        twitter: 'albaik',
      });
      expect(result.restaurant).toEqual({ name: 'Albaik', currency: 'SAR' });
      expect(result.branch).toEqual({ id: 'branch-1', name: 'Riyadh', phoneNumber: '+96611', address: 'Olaya' });
      expect(result.branches).toEqual([{ id: 'branch-1', name: 'Riyadh', phoneNumber: '+96611', address: 'Olaya' }]);
      expect(result.categories).toHaveLength(1);
      expect(result.categories[0].products[0].basePrice).toBe(9.5);
      expect(mockPrisma.table.findFirst).not.toHaveBeenCalled();
    });

    it('exposes the category imageUrl in the public site projection', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(TENANT_ROW);
      mockPrisma.restaurant.findFirst.mockResolvedValue({ id: 'rest-1', name: 'Albaik', currency: 'SAR' });
      mockPrisma.branch.findFirst.mockResolvedValue({ id: 'branch-1', name: 'Riyadh', phoneNumber: null, address: null });
      mockPrisma.branch.findMany.mockResolvedValue([{ id: 'branch-1', name: 'Riyadh', phoneNumber: null, address: null }]);
      mockPrisma.category.findMany.mockResolvedValue([
        { id: 'cat-1', name: 'Burgers', imageUrl: 'https://cdn.example.com/burgers.webp', products: [CATEGORY_ROW.products[0]] },
      ]);

      const result = await service.getPublicSite(TENANT_ID);
      expect(result.categories[0].imageUrl).toBe('https://cdn.example.com/burgers.webp');
    });

    it('returns null imageUrl when the category has no image (clean fallback)', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(TENANT_ROW);
      mockPrisma.restaurant.findFirst.mockResolvedValue({ id: 'rest-1', name: 'Albaik', currency: 'SAR' });
      mockPrisma.branch.findFirst.mockResolvedValue(null);
      mockPrisma.branch.findMany.mockResolvedValue([]);
      mockPrisma.category.findMany.mockResolvedValue([
        { id: 'cat-1', name: 'Burgers', imageUrl: null, products: [CATEGORY_ROW.products[0]] },
      ]);
      const result = await service.getPublicSite(TENANT_ID);
      expect(result.categories[0].imageUrl).toBeNull();
    });

    it('omits social when the tenant branding has no contact values', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ ...TENANT_ROW, branding: { theme: 'dark' } });
      mockPrisma.restaurant.findFirst.mockResolvedValue({ id: 'rest-1', name: 'Albaik', currency: 'SAR' });
      mockPrisma.branch.findFirst.mockResolvedValue({ id: 'branch-1', name: 'Riyadh', phoneNumber: null, address: null });
      mockPrisma.branch.findMany.mockResolvedValue([{ id: 'branch-1', name: 'Riyadh', phoneNumber: null, address: null }]);
      mockPrisma.category.findMany.mockResolvedValue([]);

      const result = await service.getPublicSite(TENANT_ID);
      expect(result.tenant.social).toBeNull();
    });

    it('applies the same subscription gating as the QR menu (UNPAID → 403)', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ ...TENANT_ROW, status: 'UNPAID' });
      await expect(service.getPublicSite(TENANT_ID)).rejects.toThrow(ForbiddenException);
    });

    it('returns 404 when the tenant has no restaurant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(TENANT_ROW);
      mockPrisma.restaurant.findFirst.mockResolvedValue(null);
      await expect(service.getPublicSite(TENANT_ID)).rejects.toThrow(NotFoundException);
    });

    it('allows a missing branch (website still renders branding + empty menu)', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(TENANT_ROW);
      mockPrisma.restaurant.findFirst.mockResolvedValue({ id: 'rest-1', name: 'Albaik', currency: 'SAR' });
      mockPrisma.branch.findFirst.mockResolvedValue(null);
      mockPrisma.branch.findMany.mockResolvedValue([]);
      mockPrisma.category.findMany.mockResolvedValue([]);
      const result = await service.getPublicSite(TENANT_ID);
      expect(result.branch).toBeNull();
      expect(result.branches).toEqual([]);
      expect(result.categories).toEqual([]);
    });

    it('exposes branding.about and every active branch for the restaurant pages', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        ...TENANT_ROW,
        branding: { about: '  Family grilled chicken since 1974.  ' },
      });
      mockPrisma.restaurant.findFirst.mockResolvedValue({ id: 'rest-1', name: 'Albaik', currency: 'SAR' });
      mockPrisma.branch.findMany.mockResolvedValue([
        { id: 'branch-1', name: 'Riyadh', phoneNumber: '+96611', address: 'Olaya' },
        { id: 'branch-2', name: 'Jeddah', phoneNumber: '+96612', address: 'Corniche' },
      ]);
      mockPrisma.category.findMany.mockResolvedValue([]);
      const result = await service.getPublicSite(TENANT_ID);
      expect(result.about).toBe('Family grilled chicken since 1974.');
      expect(result.branches).toHaveLength(2);
      expect(result.branch?.name).toBe('Riyadh');
    });
  });

  describe('PublicMenuController.getPublicSite (controller wiring)', () => {
    const reqWithTenant = { tenantId: TENANT_ID } as never;

    it('delegates site resolution to the service with the middleware tenant context', async () => {
      const spy = jest.spyOn(service, 'getPublicSite').mockResolvedValue({
        tenant: { name: 'X', logoUrl: null, bannerUrl: null, primaryColor: '#000', secondaryColor: '#fff', social: null },
        restaurant: { name: 'R', currency: 'USD' },
        branch: null,
        branches: [],
        about: null,
        categories: [],
      });
      await controller.getPublicSite(reqWithTenant);
      expect(spy).toHaveBeenCalledWith(TENANT_ID);
    });

    it('fails safe when no tenant context reached the controller', async () => {
      await expect(controller.getPublicSite({ tenantId: null } as never)).rejects.toThrow(BadRequestException);
    });
  });
});
