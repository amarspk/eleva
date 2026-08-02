import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { RbacPermissionGuard } from './rbac-permission.guard';
import { CaslAbilityFactory } from '../casl-ability.factory';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { prisma, dbTenantContext } from '@zayjar/db';

describe('RbacPermissionGuard Unit & ABAC Tests', () => {
  let guard: RbacPermissionGuard;
  let factory: CaslAbilityFactory;

  const mockReflector = {
    get: jest.fn(),
    getAllAndOverride: jest.fn().mockReturnValue(false),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbacPermissionGuard,
        CaslAbilityFactory,
        { provide: Reflector, useValue: mockReflector },
      ],
    }).compile();

    guard = module.get<RbacPermissionGuard>(RbacPermissionGuard);
    factory = module.get<CaslAbilityFactory>(CaslAbilityFactory);
    jest.clearAllMocks();
  });

  // ==========================================
  // RBAC Tests
  // ==========================================
  it('should successfully map role-to-ability inside CaslAbilityFactory', () => {
    const user = {
      id: 'u1',
      email: 'user@zayjar.com',
      tenantId: 't1',
      roles: ['CASHIER'],
      permissions: ['product:read', 'product:create'],
    };

    const ability = factory.createForUser(user);

    expect(ability.can('read', 'Product')).toBe(true);
    expect(ability.can('create', 'Product')).toBe(true);
    expect(ability.can('delete', 'Product')).toBe(false);
  });

  it('should grant master admin keys to PLATFORM_OWNER', () => {
    const admin = {
      id: 'admin1',
      email: 'admin@zayjar.com',
      tenantId: null,
      roles: ['PLATFORM_OWNER'],
      permissions: [],
    };

    const ability = factory.createForUser(admin);

    expect(ability.can('manage', 'all')).toBe(true);
    expect(ability.can('delete', 'Product')).toBe(true);
  });

  // ==========================================
  // ABAC Tests: Cashier
  // ==========================================
  it('ABAC: Cashier should be allowed to update non-PAID orders', () => {
    const cashier = {
      id: 'cashier-1',
      email: 'cashier@zayjar.com',
      tenantId: 't1',
      roles: ['CASHIER'],
      permissions: ['order:update'],
    };

    const ability = factory.createForUser(cashier);

    // Can update PENDING orders
    expect(ability.can('update', { __type: 'Order', status: 'PENDING' } as any)).toBe(true);
    
    // Cannot update PAID orders
    expect(ability.can('update', { __type: 'Order', status: 'PAID' } as any)).toBe(false);
  });

  // ==========================================
  // ABAC Tests: Branch Manager
  // ==========================================
  it('ABAC: Branch Manager can update Products only inside assigned branches', () => {
    const manager = {
      id: 'manager-1',
      email: 'manager@zayjar.com',
      tenantId: 't1',
      roles: ['BRANCH_MANAGER'],
      permissions: ['product:update'],
      branches: ['branch-uuid-1', 'branch-uuid-2'],
    };

    const ability = factory.createForUser(manager);

    // Can update product belonging to branch-uuid-1
    expect(ability.can('update', { __type: 'Product', branchId: 'branch-uuid-1' } as any)).toBe(true);
    
    // Cannot update product belonging to branch-uuid-3 (unassigned)
    expect(ability.can('update', { __type: 'Product', branchId: 'branch-uuid-3' } as any)).toBe(false);
  });

  // ==========================================
  // ABAC Integration Tests: Request Forgery Protection
  // ==========================================
  it('ABAC Integration: Forged request body cannot bypass Branch Manager restrictions', async () => {
    mockReflector.get.mockReturnValue({ action: 'update', resource: 'Product' });

    // Mock prisma.product.findFirst since our repository delegates to findFirst for scoping
    const findFirstSpy = jest.spyOn(prisma.product, 'findFirst')
      .mockResolvedValue({
        id: 'prod-uuid-999',
        tenantId: 't1',
        categoryId: 'cat-1',
        name: 'Umami Smash Burger',
        description: 'Double patty',
        imageUrl: null,
        basePrice: 14.50 as any,
        isAvailable: true,
        calories: 800,
        preparationTime: 12,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            id: 'manager-1',
            email: 'manager@zayjar.com',
            tenantId: 't1',
            roles: ['BRANCH_MANAGER'],
            permissions: ['product:update'],
            branches: ['branch-uuid-1', 'branch-uuid-2'], // Authorized branches
          },
          params: { id: 'prod-uuid-999' },
          body: {
            id: 'prod-uuid-999',
            branchId: 'branch-uuid-1', // FORGED
          },
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;

    await dbTenantContext.run({ tenantId: 't1' }, async () => {
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
    
    expect(findFirstSpy).toHaveBeenCalledWith({ where: { id: 'prod-uuid-999', tenantId: 't1' } });
  });

  it('ABAC Integration: Forged status inside request body cannot bypass Cashier PAID constraints', async () => {
    mockReflector.get.mockReturnValue({ action: 'update', resource: 'Order' });

    const findFirstSpy = jest.spyOn(prisma.order, 'findFirst')
      .mockResolvedValue({
        id: 'order-uuid-999',
        tenantId: 't1',
        branchId: 'branch-1',
        customerId: null,
        tableId: null,
        orderNumber: 'ORD-123',
        type: 'DINE_IN',
        paymentMethod: null,
        status: 'PAID' as any, // Real status in DB is PAID
        subtotal: 10 as any,
        taxAmount: 1 as any,
        discountAmount: 0 as any,
        discountId: null,
        discountCode: null,
        tipAmount: 0 as any,
        total: 11 as any,
        specialNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            id: 'cashier-1',
            email: 'cashier@zayjar.com',
            tenantId: 't1',
            roles: ['CASHIER'],
            permissions: ['order:update'],
          },
          params: { id: 'order-uuid-999' },
          body: {
            id: 'order-uuid-999',
            status: 'PENDING', // FORGED
          },
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;

    await dbTenantContext.run({ tenantId: 't1' }, async () => {
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
    
    expect(findFirstSpy).toHaveBeenCalledWith({ where: { id: 'order-uuid-999', tenantId: 't1' } });
  });

  // ==========================================
  // Guard Execution Tests
  // ==========================================
  it('should block execution if user lacks the required privilege', async () => {
    mockReflector.get.mockReturnValue({ action: 'delete', resource: 'Product' });

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            id: 'u1',
            roles: ['CASHIER'],
            permissions: ['product:read'],
          },
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('should permit execution if user holds the required privilege', async () => {
    mockReflector.get.mockReturnValue({ action: 'read', resource: 'Product' });

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            id: 'u1',
            roles: ['CASHIER'],
            permissions: ['product:read'],
          },
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;

    const allowed = await guard.canActivate(context);
    expect(allowed).toBe(true);
  });

  it('should throw UnauthorizedException if user context is missing', async () => {
    mockReflector.get.mockReturnValue({ action: 'read', resource: 'Product' });

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: null,
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});
