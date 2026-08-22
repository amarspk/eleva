import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { RbacPermissionGuard } from './rbac-permission.guard';
import { CaslAbilityFactory } from '../casl-ability.factory';
import { ForbiddenException, UnauthorizedException, NotFoundException } from '@nestjs/common';
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
  // AUDIT-002 Finding #5 — Payment RBAC
  // ==========================================
  it('RBAC: RESTAURANT_OWNER can create and read Payment', () => {
    const owner = {
      id: 'owner-1',
      email: 'owner@zayjar.com',
      tenantId: 't1',
      roles: ['RESTAURANT_OWNER'],
      permissions: ['payment:create', 'payment:read'],
    };

    const ability = factory.createForUser(owner);

    expect(ability.can('create', 'Payment')).toBe(true);
    expect(ability.can('read', 'Payment')).toBe(true);
    expect(ability.can('delete', 'Payment')).toBe(false);
  });

  it('RBAC: MANAGER with payment:create/payment:read can create and read Payment', () => {
    const manager = {
      id: 'manager-1',
      email: 'manager@zayjar.com',
      tenantId: 't1',
      roles: ['MANAGER'],
      permissions: ['payment:create', 'payment:read'],
    };

    const ability = factory.createForUser(manager);

    expect(ability.can('create', 'Payment')).toBe(true);
    expect(ability.can('read', 'Payment')).toBe(true);
  });

  it('RBAC: CASHIER with payment:create/payment:read can create and read Payment', () => {
    const cashier = {
      id: 'cashier-1',
      email: 'cashier@zayjar.com',
      tenantId: 't1',
      roles: ['CASHIER'],
      permissions: ['payment:create', 'payment:read'],
    };

    const ability = factory.createForUser(cashier);

    expect(ability.can('create', 'Payment')).toBe(true);
    expect(ability.can('read', 'Payment')).toBe(true);
  });

  it('RBAC: KITCHEN_STAFF without payment permissions cannot create or read Payment', () => {
    const kitchen = {
      id: 'kitchen-1',
      email: 'kitchen@zayjar.com',
      tenantId: 't1',
      roles: ['KITCHEN_STAFF'],
      permissions: ['order:read', 'kds:write'],
    };

    const ability = factory.createForUser(kitchen);

    expect(ability.can('create', 'Payment')).toBe(false);
    expect(ability.can('read', 'Payment')).toBe(false);
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
  it('ABAC: Branch Manager Product updates are tenant-wide (Product has no branchId column)', () => {
    const manager = {
      id: 'manager-1',
      email: 'manager@zayjar.com',
      tenantId: 't1',
      roles: ['BRANCH_MANAGER'],
      permissions: ['product:update'],
      branches: ['branch-uuid-1', 'branch-uuid-2'],
    };

    const ability = factory.createForUser(manager);

    // The real Product model has NO branchId column (schema.prisma:392) —
    // products are tenant-wide via category → restaurant. Branch-level Product
    // scoping is therefore structurally impossible and no Product branch rule
    // is registered; the manager's product:update applies tenant-wide.
    expect(ability.can('update', { __type: 'Product' } as any)).toBe(true);
  });

  // ==========================================
  // Phase 4 P0 — Branch-Scoped ABAC (CASHIER / KITCHEN_STAFF / BRANCH_MANAGER)
  // ==========================================
  it('Phase 4 P0: CASHIER can only read/create/update Orders in assigned branches', () => {
    const cashier = {
      id: 'cashier-1',
      email: 'cashier@zayjar.com',
      tenantId: 't1',
      roles: ['CASHIER'],
      permissions: ['order:read', 'order:create', 'order:update'],
      branches: ['branch-uuid-1'],
    };
    const ability = factory.createForUser(cashier);
    // assigned branch -> allowed
    expect(ability.can('read', { __type: 'Order', branchId: 'branch-uuid-1' } as any)).toBe(true);
    expect(ability.can('create', { __type: 'Order', branchId: 'branch-uuid-1' } as any)).toBe(true);
    expect(ability.can('update', { __type: 'Order', branchId: 'branch-uuid-1', status: 'PENDING' } as any)).toBe(true);
    // foreign branch -> denied
    expect(ability.can('read', { __type: 'Order', branchId: 'branch-uuid-3' } as any)).toBe(false);
    expect(ability.can('create', { __type: 'Order', branchId: 'branch-uuid-3' } as any)).toBe(false);
    expect(ability.can('update', { __type: 'Order', branchId: 'branch-uuid-3', status: 'PENDING' } as any)).toBe(false);
    // PAID constraint preserved within the assigned branch
    expect(ability.can('update', { __type: 'Order', branchId: 'branch-uuid-1', status: 'PAID' } as any)).toBe(false);
  });

  it('Phase 4 P0: KITCHEN_STAFF can only read/update Orders in assigned branches', () => {
    const kitchen = {
      id: 'kitchen-1',
      email: 'kitchen@zayjar.com',
      tenantId: 't1',
      roles: ['KITCHEN_STAFF'],
      permissions: ['order:read', 'order:update'],
      branches: ['branch-uuid-1'],
    };
    const ability = factory.createForUser(kitchen);
    expect(ability.can('read', { __type: 'Order', branchId: 'branch-uuid-1' } as any)).toBe(true);
    expect(ability.can('update', { __type: 'Order', branchId: 'branch-uuid-1', status: 'PREPARING' } as any)).toBe(true);
    expect(ability.can('read', { __type: 'Order', branchId: 'branch-uuid-2' } as any)).toBe(false);
    expect(ability.can('update', { __type: 'Order', branchId: 'branch-uuid-2', status: 'PREPARING' } as any)).toBe(false);
  });

  it('Phase 4 P0: BRANCH_MANAGER cannot create Orders in unassigned branches', () => {
    const manager = {
      id: 'manager-1',
      email: 'manager@zayjar.com',
      tenantId: 't1',
      roles: ['BRANCH_MANAGER'],
      permissions: ['order:create', 'order:read', 'order:update'],
      branches: ['branch-uuid-1', 'branch-uuid-2'],
    };
    const ability = factory.createForUser(manager);
    expect(ability.can('create', { __type: 'Order', branchId: 'branch-uuid-1' } as any)).toBe(true);
    expect(ability.can('create', { __type: 'Order', branchId: 'branch-uuid-3' } as any)).toBe(false);
    expect(ability.can('update', { __type: 'Order', branchId: 'branch-uuid-3', status: 'PENDING' } as any)).toBe(false);
  });

  it('Phase 4 P0: branchless subjects (list endpoints) pass the guard; scope is enforced at the service layer', () => {
    const cashier = {
      id: 'cashier-1',
      email: 'cashier@zayjar.com',
      tenantId: 't1',
      roles: ['CASHIER'],
      permissions: ['order:read', 'order:create', 'order:update'],
      branches: ['branch-uuid-1'],
    };
    const ability = factory.createForUser(cashier);
    // List endpoint subject has no branchId -> the $exists:true condition does
    // not fire, so the guard allows the general `read Order` permission and the
    // service scopes the query to assigned branches.
    expect(ability.can('read', { __type: 'Order' } as any)).toBe(true);
    // Create body WITHOUT a branchId would be invalid DTO-wise, but the rule
    // must not pre-empt service validation either.
    expect(ability.can('create', { __type: 'Order' } as any)).toBe(true);
    // Entity-level subjects carrying a foreign branchId are still denied.
    expect(ability.can('read', { __type: 'Order', branchId: 'branch-uuid-2' } as any)).toBe(false);
  });

  it('Phase 4 P0: RESTAURANT_OWNER remains tenant-wide (no branch restriction)', () => {
    const owner = {
      id: 'owner-1',
      email: 'owner@zayjar.com',
      tenantId: 't1',
      roles: ['RESTAURANT_OWNER'],
      permissions: ['order:read', 'order:create', 'order:update'],
    };
    const ability = factory.createForUser(owner);
    expect(ability.can('read', { __type: 'Order', branchId: 'any-branch' } as any)).toBe(true);
    expect(ability.can('create', { __type: 'Order', branchId: 'any-branch' } as any)).toBe(true);
  });

  it('Phase 4 P0: PLATFORM_OWNER manage-all is not narrowed by branch rules', () => {
    const owner = {
      id: 'po-1',
      email: 'po@zayjar.com',
      tenantId: null,
      roles: ['PLATFORM_OWNER'],
      permissions: [],
    };
    const ability = factory.createForUser(owner);
    expect(ability.can('manage', 'all')).toBe(true);
    expect(ability.can('read', { __type: 'Order', branchId: 'foreign-branch' } as any)).toBe(true);
  });

  // ==========================================
  // ABAC Integration Tests: Request Forgery Protection
  // ==========================================
  it('ABAC Integration: the DB-resolved entity is authoritative over a forged body branchId (Product has no branchId column)', async () => {
    mockReflector.get.mockReturnValue({ action: 'update', resource: 'Product' });

    // Mock prisma.product.findFirst since our repository delegates to findFirst for scoping.
    // The real Product model has NO branchId column (schema.prisma — products are
    // tenant-wide via category → restaurant), so a forged `body.branchId` cannot
    // manufacture a branch restriction: the guard re-resolves the entity from the
    // database and the ability is evaluated against THAT entity, not the body.
    const findFirstSpy = jest.spyOn(prisma.product, 'findFirst')
      .mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111999',
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
          params: { id: '11111111-1111-4111-8111-111111111999' },
          body: {
            id: '11111111-1111-4111-8111-111111111999',
            branchId: 'branch-uuid-1', // FORGED — must NOT be used for the check
          },
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;

    await dbTenantContext.run({ tenantId: 't1' }, async () => {
      // The entity carries no branchId -> the branch-scoped cannot rule does not
      // fire (with `$exists: true`); the manager's product:update permission
      // applies. This is the repository-truthful behavior: Product is tenant-wide.
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
    
    // DOC-002 soft-delete policy: reads on soft-deletable models now also
    // exclude `deletedAt`-stamped rows.
    expect(findFirstSpy).toHaveBeenCalledWith({
      where: { id: '11111111-1111-4111-8111-111111111999', tenantId: 't1', deletedAt: null },
    });
  });

  it('ABAC Integration: Forged status inside request body cannot bypass Cashier PAID constraints', async () => {
    mockReflector.get.mockReturnValue({ action: 'update', resource: 'Order' });

    const findFirstSpy = jest.spyOn(prisma.order, 'findFirst')
      .mockResolvedValue({
        id: '22222222-2222-4222-8222-222222222999',
        tenantId: 't1',
        branchId: 'branch-1',
        customerId: null,
        tableId: null,
        orderNumber: 'ORD-123',
        type: 'DINE_IN',
        paymentMethod: null,
        isPreorder: false,
        scheduledAt: null,
        preorderStatus: null,
        walletUsed: 0 as any,
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
          params: { id: '22222222-2222-4222-8222-222222222999' },
          body: {
            id: '22222222-2222-4222-8222-222222222999',
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
    
    // Order has no `deletedAt` column, so its scope is unchanged.
    expect(findFirstSpy).toHaveBeenCalledWith({
      where: { id: '22222222-2222-4222-8222-222222222999', tenantId: 't1' },
    });
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


  it('rejects a malformed (non-UUID) record id as 404 instead of leaking a DB error', async () => {
    // Guards run BEFORE pipes in Nest, so a route-level ParseUUIDPipe cannot
    // protect the guard's own repository lookup. Pre-fix a non-UUID param
    // reached a `@db.Uuid` column and surfaced as an unhandled HTTP 500
    // ("Inconsistent column data: Error creating UUID") — reproduced live on
    // /users/1000 and on the pre-existing /orders/1000.
    mockReflector.get.mockReturnValue({ action: 'read', resource: 'Product' });

    const findFirstSpy = jest.spyOn(prisma.product, 'findFirst');

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            id: 'u1',
            email: 'user@zayjar.com',
            tenantId: 't1',
            roles: ['CASHIER'],
            permissions: ['product:read'],
          },
          params: { id: '1000' },
          body: {},
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;

    await dbTenantContext.run({ tenantId: 't1' }, async () => {
      await expect(guard.canActivate(context)).rejects.toThrow(NotFoundException);
    });

    // Short-circuited before touching the database.
    expect(findFirstSpy).not.toHaveBeenCalled();
  });
});
