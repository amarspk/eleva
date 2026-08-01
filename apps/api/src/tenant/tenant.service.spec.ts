import { Test, TestingModule } from '@nestjs/testing';
import { TenantService } from './tenant.service';
import { AuthService } from '../auth/auth.service';
import { prisma, prismaRead } from '@zayjar/db';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock-argon2-hash'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

describe('TenantService Unit Tests', () => {
  let service: TenantService;

  const mockAuthService = {
    hashPassword: jest.fn().mockResolvedValue('mock-argon2-hash'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantService,
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    service = module.get<TenantService>(TenantService);
    jest.clearAllMocks();
  });

  it('should successfully orchestrate tenant onboarding inside transaction', async () => {
    const txMock = {
      tenant: { create: jest.fn().mockResolvedValue({ id: 't1', name: 'Gourmet', subdomain: 'gourmet', status: 'TRIALING' }) },
      subscription: { create: jest.fn().mockResolvedValue({}) },
      user: { create: jest.fn().mockResolvedValue({ id: 'u1', email: 'owner@gourmet.com' }) },
      role: {
        create: jest.fn().mockResolvedValue({ id: 'r1' }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'r-canonical',
          rolePermissions: [
            { permissionId: 'perm-branch-read' },
            { permissionId: 'perm-product-read' },
            { permissionId: 'perm-order-create' },
          ],
        }),
      },
      userRole: { create: jest.fn().mockResolvedValue({}) },
      rolePermission: { createMany: jest.fn().mockResolvedValue({ count: 3 }) },
      restaurant: { create: jest.fn().mockResolvedValue({ id: 'rest1', name: 'Gourmet', currency: 'USD', timezone: 'UTC' }) },
      branch: { create: jest.fn().mockResolvedValue({ id: 'b1', name: 'Main Branch' }) },
    };

    jest.spyOn(prisma, '$transaction').mockImplementation((async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)) as any);
    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue(null);
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);

    const dto = {
      companyName: 'Gourmet',
      subdomain: 'gourmet',
      ownerFirstName: 'John',
      ownerLastName: 'Doe',
      ownerEmail: 'owner@gourmet.com',
      ownerPassword: 'Password123!',
      planId: 'plan1',
    };

    const result = await service.onboard(dto) as Record<string, unknown>;

    expect((result.tenant as Record<string, string>).id).toBe('t1');
    expect((result.owner as Record<string, string>).id).toBe('u1');
    expect((result.branch as Record<string, string>).id).toBe('b1');
    expect(mockAuthService.hashPassword).toHaveBeenCalledWith('Password123!');
    // RT-ONB-002: the new owner role inherits the canonical seeded
    // RESTAURANT_OWNER permission set (same permissionIds, new role id target),
    // excluding the just-created role from the lookup.
    expect(txMock.role.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: 'RESTAURANT_OWNER', NOT: { id: 'r1' } },
        orderBy: { createdAt: 'asc' },
      }),
    );
    expect(txMock.rolePermission.createMany).toHaveBeenCalledWith({
      data: [
        { roleId: 'r1', permissionId: 'perm-branch-read' },
        { roleId: 'r1', permissionId: 'perm-product-read' },
        { roleId: 'r1', permissionId: 'perm-order-create' },
      ],
    });
    expect(txMock.restaurant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Gourmet',
        currency: 'USD',
        timezone: 'UTC',
        taxPercentage: 0,
      }),
    });
  });

  it('should use restaurant and branch details from wizard DTO when provided', async () => {
    const txMock = {
      tenant: { create: jest.fn().mockResolvedValue({ id: 't2', name: 'Spice Route', subdomain: 'spice-route', status: 'TRIALING' }) },
      subscription: { create: jest.fn().mockResolvedValue({}) },
      user: { create: jest.fn().mockResolvedValue({ id: 'u2', email: 'chef@spice.com' }) },
      role: {
        create: jest.fn().mockResolvedValue({ id: 'r2' }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'r-canonical',
          rolePermissions: [{ permissionId: 'perm-menu-read' }],
        }),
      },
      userRole: { create: jest.fn().mockResolvedValue({}) },
      rolePermission: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      restaurant: { create: jest.fn().mockResolvedValue({ id: 'rest2', name: 'Spice Kitchen', currency: 'KWD', timezone: 'Asia/Kuwait' }) },
      branch: { create: jest.fn().mockResolvedValue({ id: 'b2', name: 'Kuwait City Branch' }) },
    };

    jest.spyOn(prisma, '$transaction').mockImplementation((async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)) as any);
    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue(null);
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);

    const dto = {
      companyName: 'Spice Route',
      subdomain: 'spice-route',
      ownerFirstName: 'Ahmed',
      ownerLastName: 'Ali',
      ownerEmail: 'chef@spice.com',
      ownerPassword: 'StrongPass1!',
      planId: 'plan2',
      restaurantName: 'Spice Kitchen',
      currency: 'KWD',
      timezone: 'Asia/Kuwait',
      taxPercentage: 15,
      branch: {
        name: 'Kuwait City Branch',
        address: 'Kuwait City, Block 5, Street 12',
        phoneNumber: '+96522334455',
        latitude: 29.3759,
        longitude: 47.9774,
        operatingHours: {
          monday: { open: '10:00', close: '23:00', closed: false },
          tuesday: { open: '10:00', close: '23:00', closed: false },
          wednesday: { open: '10:00', close: '23:00', closed: false },
          thursday: { open: '10:00', close: '23:00', closed: false },
          friday: { open: '14:00', close: '23:00', closed: false },
          saturday: { open: '10:00', close: '23:00', closed: false },
          sunday: { open: '10:00', close: '22:00', closed: false },
        },
      },
    };

    const result = await service.onboard(dto) as Record<string, unknown>;

    expect((result.restaurant as Record<string, string>).name).toBe('Spice Kitchen');
    expect((result.restaurant as Record<string, string>).currency).toBe('KWD');
    expect(txMock.restaurant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Spice Kitchen',
        currency: 'KWD',
        timezone: 'Asia/Kuwait',
        taxPercentage: 15,
      }),
    });
    expect(txMock.branch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Kuwait City Branch',
        address: 'Kuwait City, Block 5, Street 12',
        phoneNumber: '+96522334455',
        latitude: 29.3759,
        longitude: 47.9774,
      }),
    });
  });

  // RT-ONB-002: provisioning must fail fast instead of silently creating a
  // permission-less owner role when the canonical permission baseline is absent.
  it('should fail fast when the canonical RESTAURANT_OWNER role is missing', async () => {
    const txMock = {
      tenant: { create: jest.fn().mockResolvedValue({ id: 't3', name: 'X', subdomain: 'x', status: 'TRIALING' }) },
      subscription: { create: jest.fn().mockResolvedValue({}) },
      user: { create: jest.fn().mockResolvedValue({ id: 'u3', email: 'o@x.com' }) },
      role: {
        create: jest.fn().mockResolvedValue({ id: 'r3' }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      userRole: { create: jest.fn().mockResolvedValue({}) },
      restaurant: { create: jest.fn().mockResolvedValue({ id: 'rest3' }) },
      branch: { create: jest.fn().mockResolvedValue({ id: 'b3', name: 'Main Branch' }) },
    };

    jest.spyOn(prisma, '$transaction').mockImplementation((async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)) as any);
    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue(null);
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);

    await expect(
      service.onboard({
        companyName: 'X',
        subdomain: 'x',
        ownerFirstName: 'O',
        ownerLastName: 'W',
        ownerEmail: 'o@x.com',
        ownerPassword: 'Password123!',
        planId: 'plan1',
      }),
    ).rejects.toThrow('no RESTAURANT_OWNER role exists');
  });

  it('should fail fast when the canonical owner role has no permissions', async () => {
    const txMock = {
      tenant: { create: jest.fn().mockResolvedValue({ id: 't4', name: 'Y', subdomain: 'y', status: 'TRIALING' }) },
      subscription: { create: jest.fn().mockResolvedValue({}) },
      user: { create: jest.fn().mockResolvedValue({ id: 'u4', email: 'o@y.com' }) },
      role: {
        create: jest.fn().mockResolvedValue({ id: 'r4' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'r-canonical', rolePermissions: [] }),
      },
      userRole: { create: jest.fn().mockResolvedValue({}) },
      restaurant: { create: jest.fn().mockResolvedValue({ id: 'rest4' }) },
      branch: { create: jest.fn().mockResolvedValue({ id: 'b4', name: 'Main Branch' }) },
    };

    jest.spyOn(prisma, '$transaction').mockImplementation((async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)) as any);
    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue(null);
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);

    await expect(
      service.onboard({
        companyName: 'Y',
        subdomain: 'y',
        ownerFirstName: 'O',
        ownerLastName: 'W',
        ownerEmail: 'o@y.com',
        ownerPassword: 'Password123!',
        planId: 'plan1',
      }),
    ).rejects.toThrow('has no permissions');
  });

  it('should reject duplicate subdomain during onboarding', async () => {
    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({ id: 'existing' } as never);

    await expect(
      service.onboard({
        companyName: 'Test',
        subdomain: 'existing',
        ownerFirstName: 'A',
        ownerLastName: 'B',
        ownerEmail: 'a@b.com',
        ownerPassword: 'Password123!',
        planId: 'plan1',
      }),
    ).rejects.toThrow('subdomain is already registered');
  });

  it('should reject duplicate email during onboarding', async () => {
    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue(null);
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue({ id: 'existing-user' } as never);

    await expect(
      service.onboard({
        companyName: 'Test',
        subdomain: 'new-tenant',
        ownerFirstName: 'A',
        ownerLastName: 'B',
        ownerEmail: 'existing@example.com',
        ownerPassword: 'Password123!',
        planId: 'plan1',
      }),
    ).rejects.toThrow('email address already exists');
  });

  it('should return available subscription plans', async () => {
    const mockPlans = [
      { id: 'plan1', name: 'Starter', priceMonthly: 29, priceYearly: 290, maxBranches: 2, maxRestaurants: 1, maxProductsPerBranch: 50, allowCustomDomains: false, allowOnlinePayments: false, allowAnalytics: false },
      { id: 'plan2', name: 'Growth', priceMonthly: 79, priceYearly: 790, maxBranches: 5, maxRestaurants: 3, maxProductsPerBranch: 200, allowCustomDomains: true, allowOnlinePayments: true, allowAnalytics: true },
    ];
    jest.spyOn(prismaRead.subscriptionPlan, 'findMany').mockResolvedValue(mockPlans as never);

    const plans = await service.getAvailablePlans();

    expect(plans).toHaveLength(2);
    expect(plans[0].name).toBe('Starter');
    expect(prismaRead.subscriptionPlan.findMany).toHaveBeenCalledWith({ orderBy: { priceMonthly: 'asc' } });
  });

  it('should use prismaRead for read-only tenant queries (read replica routing)', async () => {
    const mockTenant = {
      id: 't1',
      name: 'Gourmet',
      subdomain: 'gourmet',
      customDomain: null,
      status: 'ACTIVE',
      logoUrl: null,
      bannerUrl: null,
      primaryColor: '#000',
      secondaryColor: '#FFF',
      branding: { translations: { ar: { name: 'جورميه' } } },
    };

    jest.spyOn(prismaRead.tenant, 'findUnique').mockResolvedValue(mockTenant as never);

    const result = await service.getTenantById('t1');

    expect(prismaRead.tenant.findUnique).toHaveBeenCalledWith({ where: { id: 't1' } });
    expect(result.branding.logoUrl).toBeNull();
    expect(result.branding.translations).toEqual({ ar: { name: 'جورميه' } });
  });

  it('should merge JSONB dynamic branding into static branding fields', async () => {
    const mockTenant = {
      id: 't1',
      name: 'Gourmet',
      subdomain: 'gourmet',
      customDomain: null,
      status: 'ACTIVE',
      logoUrl: 'https://cdn.example.com/logo.webp',
      bannerUrl: null,
      primaryColor: '#FF5733',
      secondaryColor: '#C70039',
      branding: { layout: 'modern', menuStyle: 'cards', translations: { ar: { welcome: 'أهلا' } } },
    };

    jest.spyOn(prismaRead.tenant, 'findUnique').mockResolvedValue(mockTenant as never);

    const result = await service.getTenantById('t1');

    expect(result.branding.logoUrl).toBe('https://cdn.example.com/logo.webp');
    expect(result.branding.primaryColor).toBe('#FF5733');
    expect(result.branding.layout).toBe('modern');
    expect(result.branding.menuStyle).toBe('cards');
    expect(result.branding.translations).toEqual({ ar: { welcome: 'أهلا' } });
  });
});
