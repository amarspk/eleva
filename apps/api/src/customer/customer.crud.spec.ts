import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CustomerService } from './customer.service';
import { CustomerController } from './customer.controller';
import { UpdateCustomerRequestDto } from './dto/update-customer-request.dto';
import { REQUIRE_PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';

/**
 * AUDIT-014 — Customer CRUD + the DEFECT-H authorization regression.
 *
 * DEFECT-H (runtime-proven, CRITICAL): `CustomerController` shipped with NO
 * `@UseGuards`, and the app registers no global auth guard — only `CsrfGuard`.
 * A bare unauthenticated request returned the whole customer PII table:
 *
 *   curl http://albaik.localhost:8000/api/v1/customers   ->  HTTP 200
 *   [{"firstName":"Noura","email":"noura.saeed@email.com","loyaltyPoints":75,...}]
 *
 * After the fix the same request is 401, while `POST` (guest self-registration)
 * stays public by design.
 */

const repoState: {
  customer: Record<string, unknown> | null;
  includingDeleted: Record<string, unknown> | null;
  byEmail: Record<string, unknown>[];
} = { customer: null, includingDeleted: null, byEmail: [] };

const calls: { update: unknown[][]; softDelete: unknown[][]; restore: unknown[][] } = {
  update: [],
  softDelete: [],
  restore: [],
};

let activeOrderCount = 0;
let lastCountWhere: Record<string, unknown> | null = null;

jest.mock('@zayjar/db', () => {
  class TenantCustomerRepository {
    async findById(): Promise<unknown> {
      return repoState.customer;
    }
    async findByIdIncludingDeleted(): Promise<unknown> {
      return repoState.includingDeleted;
    }
    async findMany(): Promise<unknown[]> {
      return repoState.byEmail;
    }
    async create(data: Record<string, unknown>): Promise<unknown> {
      return { id: 'new-id', createdAt: new Date(), loyaltyPoints: 0, ...data };
    }
    async update(...args: unknown[]): Promise<unknown> {
      calls.update.push(args);
      return { ...(repoState.customer as object), ...(args[1] as object) };
    }
    async softDelete(...args: unknown[]): Promise<unknown> {
      calls.softDelete.push(args);
      return repoState.customer;
    }
    async restore(...args: unknown[]): Promise<unknown> {
      calls.restore.push(args);
      return repoState.includingDeleted;
    }
  }
  // Importing CustomerController pulls in RbacPermissionGuard, which
  // instantiates the whole tenant repository registry at module load. Every
  // repository it touches must therefore be constructible here.
  class StubRepo {
    async findById(): Promise<null> {
      return null;
    }
    async findByIdIncludingDeleted(): Promise<null> {
      return null;
    }
  }

  return {
    TenantCustomerRepository,
    TenantProductRepository: StubRepo,
    TenantCategoryRepository: StubRepo,
    TenantOrderRepository: StubRepo,
    TenantBranchRepository: StubRepo,
    TenantRestaurantRepository: StubRepo,
    TenantUserRepository: StubRepo,
    TenantTableRepository: StubRepo,
    prisma: {
      tenant: { findUnique: jest.fn() },
      order: {
        count: jest.fn(async (args: { where: Record<string, unknown> }) => {
          lastCountWhere = args.where;
          return activeOrderCount;
        }),
      },
    },
  };
});

const CUSTOMER_ID = '2c0d356f-c26e-498c-8dd9-714a555da96a';
const TENANT_ID = '80a00898-782c-4a6e-8bad-880e8f4f7977';

describe('CustomerService — AUDIT-014 CRUD', () => {
  let service: CustomerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CustomerService],
    }).compile();
    service = module.get<CustomerService>(CustomerService);

    repoState.customer = {
      id: CUSTOMER_ID,
      tenantId: TENANT_ID,
      firstName: 'Noura',
      lastName: 'Saeed',
      email: 'noura@example.com',
      loyaltyPoints: 75,
      deletedAt: null,
    };
    repoState.includingDeleted = repoState.customer;
    repoState.byEmail = [];
    calls.update = [];
    calls.softDelete = [];
    calls.restore = [];
    activeOrderCount = 0;
    lastCountWhere = null;
  });

  describe('updateCustomer', () => {
    it('applies only the supplied fields', async () => {
      await service.updateCustomer(CUSTOMER_ID, { firstName: 'Renamed' });
      expect(calls.update[0][1]).toEqual({ firstName: 'Renamed' });
    });

    it('is a no-op that returns the row for an empty body', async () => {
      const result = await service.updateCustomer(CUSTOMER_ID, {});
      expect(calls.update).toHaveLength(0);
      expect(result).toBe(repoState.customer);
    });

    it('404s for an unknown / foreign customer', async () => {
      repoState.customer = null;
      await expect(service.updateCustomer(CUSTOMER_ID, { firstName: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('409s when the new email belongs to another live customer', async () => {
      repoState.byEmail = [{ id: 'someone-else' }];
      await expect(
        service.updateCustomer(CUSTOMER_ID, { email: 'taken@example.com' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(calls.update).toHaveLength(0);
    });

    it('allows re-submitting the customer own email unchanged', async () => {
      repoState.byEmail = [{ id: CUSTOMER_ID }];
      await expect(
        service.updateCustomer(CUSTOMER_ID, { email: 'noura@example.com', firstName: 'N' }),
      ).resolves.toBeDefined();
    });
  });

  describe('deleteCustomer', () => {
    it('soft-deletes and never hard-deletes', async () => {
      const result = await service.deleteCustomer(CUSTOMER_ID);
      expect(result).toEqual({ id: CUSTOMER_ID, deleted: true });
      expect(calls.softDelete[0][0]).toBe(CUSTOMER_ID);
    });

    it('refuses (409) while the customer has orders in progress', async () => {
      activeOrderCount = 2;
      await expect(service.deleteCustomer(CUSTOMER_ID)).rejects.toBeInstanceOf(ConflictException);
      expect(calls.softDelete).toHaveLength(0);
    });

    it('scopes the active-order probe by tenant and open statuses', async () => {
      await service.deleteCustomer(CUSTOMER_ID);
      expect(lastCountWhere).toMatchObject({ customerId: CUSTOMER_ID, tenantId: TENANT_ID });
      expect((lastCountWhere as { status: { in: string[] } }).status.in).toEqual(
        expect.arrayContaining(['DRAFT', 'PENDING', 'ACCEPTED', 'PREPARING', 'READY']),
      );
    });

    it('404s for an unknown / foreign customer', async () => {
      repoState.customer = null;
      await expect(service.deleteCustomer(CUSTOMER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('restoreCustomer', () => {
    beforeEach(() => {
      repoState.includingDeleted = { ...(repoState.customer as object), deletedAt: new Date() };
    });

    it('restores a soft-deleted customer', async () => {
      const result = await service.restoreCustomer(CUSTOMER_ID);
      expect(result).toEqual({ id: CUSTOMER_ID, restored: true });
    });

    it('refuses (409) when a live customer already holds the email', async () => {
      repoState.byEmail = [{ id: 'replacement-id' }];
      await expect(service.restoreCustomer(CUSTOMER_ID)).rejects.toBeInstanceOf(ConflictException);
      expect(calls.restore).toHaveLength(0);
    });

    it('404s when the id matches nothing even including deleted rows', async () => {
      repoState.includingDeleted = null;
      await expect(service.restoreCustomer(CUSTOMER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('404s for a soft-deleted customer (findById filters them)', async () => {
      repoState.customer = null;
      await expect(service.findOne(CUSTOMER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

/**
 * DEFECT-H regression: the authorization metadata must exist on the controller.
 * These assertions read the actual Nest metadata, so deleting a guard or a
 * `@RequirePermission` decorator fails the suite rather than silently
 * re-opening the PII leak.
 */
describe('CustomerController — DEFECT-H authorization metadata', () => {
  it('applies class-level guards (the leak was a missing @UseGuards)', () => {
    const guards = Reflect.getMetadata('__guards__', CustomerController);
    expect(guards).toBeDefined();
    expect(guards.length).toBeGreaterThanOrEqual(2);
    const names = guards.map((g: { name: string }) => g.name);
    expect(names).toEqual(expect.arrayContaining(['JwtAuthGuard', 'RbacPermissionGuard']));
  });

  it.each([
    ['getCustomers', 'read'],
    ['getCustomer', 'read'],
    ['updateCustomer', 'update'],
    ['deleteCustomer', 'delete'],
    ['restoreCustomer', 'update'],
  ])('%s requires the %s permission on Customer', (method, action) => {
    const meta = Reflect.getMetadata(
      REQUIRE_PERMISSION_KEY,
      CustomerController.prototype[method as keyof typeof CustomerController.prototype],
    );
    expect(meta).toEqual({ action, resource: 'Customer' });
  });

  it('keeps ONLY createCustomer public (guest self-registration)', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, CustomerController.prototype.createCustomer)).toBe(true);
    for (const method of ['getCustomers', 'getCustomer', 'updateCustomer', 'deleteCustomer']) {
      const isPublic = Reflect.getMetadata(
        IS_PUBLIC_KEY,
        CustomerController.prototype[method as keyof typeof CustomerController.prototype],
      );
      expect(isPublic).toBeFalsy();
    }
  });
});

describe('UpdateCustomerRequestDto validation', () => {
  it('rejects a malformed email', async () => {
    const errors = await validate(plainToInstance(UpdateCustomerRequestDto, { email: 'not-an-email' }));
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('rejects negative loyalty points', async () => {
    const errors = await validate(plainToInstance(UpdateCustomerRequestDto, { loyaltyPoints: -5 }));
    expect(errors.some((e) => e.property === 'loyaltyPoints')).toBe(true);
  });

  it('rejects a non-integer loyalty balance', async () => {
    const errors = await validate(plainToInstance(UpdateCustomerRequestDto, { loyaltyPoints: 1.5 }));
    expect(errors.some((e) => e.property === 'loyaltyPoints')).toBe(true);
  });

  it('accepts an empty body (all fields optional)', async () => {
    expect(await validate(plainToInstance(UpdateCustomerRequestDto, {}))).toHaveLength(0);
  });

  it('declares no tenantId / loyalty bypass fields', () => {
    const declared = Object.getOwnPropertyNames(new UpdateCustomerRequestDto());
    expect(declared).not.toContain('tenantId');
    expect(declared).not.toContain('deletedAt');
  });
});
