import { UnauthorizedException } from '@nestjs/common';
import { CustomerJwtStrategy } from './customer-jwt.strategy';

jest.mock('@zayjar/db', () => {
  const customerFindUnique = jest.fn();
  return {
    prisma: { customer: { findUnique: customerFindUnique } },
    dbTenantContext: {
      run: jest.fn((_c: unknown, fn: () => unknown) => fn()),
      getStore: jest.fn(() => ({ tenantId: 'tenant-1' })),
    },
    __m: { customerFindUnique },
  };
});

const mockDb = jest.requireMock('@zayjar/db').__m as { customerFindUnique: jest.Mock };
const mockCtx = jest.requireMock('@zayjar/db').dbTenantContext as { getStore: jest.Mock };

describe('CustomerJwtStrategy (Phase 4 — separation from staff auth)', () => {
  let strategy: CustomerJwtStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new CustomerJwtStrategy();
    mockDb.customerFindUnique.mockResolvedValue({
      id: 'customer-1',
      tenantId: 'tenant-1',
      email: 'sara@example.com',
    });
  });

  it('accepts a customer token and resolves the customer', async () => {
    const result = await strategy.validate({ sub: 'customer-1', type: 'customer', tenantId: 'tenant-1' });
    expect(result).toEqual({ customerId: 'customer-1', tenantId: 'tenant-1', email: 'sara@example.com' });
  });

  it('rejects a staff token (no customer type claim)', async () => {
    await expect(strategy.validate({ sub: 'user-1', type: undefined, tenantId: 'tenant-1' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token whose subject is not a customer (staff user id)', async () => {
    mockDb.customerFindUnique.mockResolvedValue(null);
    await expect(strategy.validate({ sub: 'user-1', type: 'customer' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('never calls the staff user table (only the tenant-scoped customer lookup)', async () => {
    await strategy.validate({ sub: 'customer-1', type: 'customer' });
    expect(mockDb.customerFindUnique).toHaveBeenCalledWith({ where: { id: 'customer-1' } });
  });

  it('rejects a customer row that belongs to another tenant (findUnique is not ALS-scoped)', async () => {
    mockDb.customerFindUnique.mockResolvedValue({
      id: 'customer-1',
      tenantId: 'tenant-OTHER',
      email: 'sara@example.com',
    });
    await expect(strategy.validate({ sub: 'customer-1', type: 'customer', tenantId: 'tenant-1' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the request has no tenant context', async () => {
    mockCtx.getStore.mockReturnValueOnce({});
    await expect(strategy.validate({ sub: 'customer-1', type: 'customer' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });
});