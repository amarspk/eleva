import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { CustomerAuthService } from './customer-auth.service';

jest.mock('@zayjar/db', () => {
  const customerFindMany = jest.fn();
  const customerFindUnique = jest.fn();
  const customerCreate = jest.fn();
  const customerUpdate = jest.fn();
  const orderFindMany = jest.fn();
  return {
    prisma: {
      customer: {
        findMany: customerFindMany,
        findUnique: customerFindUnique,
        create: customerCreate,
        update: customerUpdate,
      },
      order: { findMany: orderFindMany },
    },
    dbTenantContext: {
      getStore: () => ({ tenantId: 'tenant-1' }),
      run: jest.fn((_c: unknown, fn: () => unknown) => fn()),
    },
    __m: {
      customerFindMany, customerFindUnique, customerCreate, customerUpdate, orderFindMany,
    },
  };
});

jest.mock('@nestjs/jwt', () => ({
  JwtService: class {
    signAsync = jest.fn().mockResolvedValue('customer-token-1');
  },
}));

jest.mock('../auth/auth.service', () => ({
  AuthService: class {
    hashPassword = jest.fn().mockResolvedValue('argon2-hash');
    comparePassword = jest.fn().mockResolvedValue(true);
  },
}));

jest.mock('../common/csrf/csrf.service', () => ({
  CsrfService: class {
    generateToken = jest.fn().mockResolvedValue('csrf-1');
    deleteToken = jest.fn().mockResolvedValue(undefined);
  },
}));

const mockDb = jest.requireMock('@zayjar/db').__m as {
  customerFindMany: jest.Mock;
  customerFindUnique: jest.Mock;
  customerCreate: jest.Mock;
  customerUpdate: jest.Mock;
  orderFindMany: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AuthService } = jest.requireMock('../auth/auth.service') as { AuthService: new () => { hashPassword: jest.Mock; comparePassword: jest.Mock } };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JwtService } = jest.requireMock('@nestjs/jwt') as { JwtService: new () => { signAsync: jest.Mock } };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CsrfService } = jest.requireMock('../common/csrf/csrf.service') as { CsrfService: new () => { generateToken: jest.Mock; deleteToken: jest.Mock } };

const customerRow = {
  id: 'customer-1',
  tenantId: 'tenant-1',
  firstName: 'Sara',
  lastName: 'Ali',
  email: 'sara@example.com',
  phoneNumber: '+96891234567',
  passwordHash: 'argon2-hash',
  loyaltyPoints: 0,
  createdAt: new Date('2026-08-18T10:00:00.000Z'),
};

describe('CustomerAuthService (Phase 4 — Customer Account & Profile)', () => {
  let service: CustomerAuthService;
  const auth = new AuthService();
  const jwt = new JwtService();
  const csrf = new CsrfService();

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CustomerAuthService(auth, jwt as never, csrf as never);
    mockDb.customerFindMany.mockResolvedValue([]);
    mockDb.customerCreate.mockResolvedValue(customerRow);
    mockDb.customerFindUnique.mockResolvedValue(customerRow);
    mockDb.customerUpdate.mockResolvedValue(customerRow);
    mockDb.orderFindMany.mockResolvedValue([]);
  });

  it('registers a customer with a hashed password and issues a customer token', async () => {
    const result = await service.register({
      firstName: 'Sara', lastName: 'Ali', email: 'sara@example.com',
      phoneNumber: '+96891234567', password: 'secret123',
    });
    expect(mockDb.customerCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ passwordHash: 'argon2-hash', tenantId: 'tenant-1' }),
    }));
    expect(auth.hashPassword).toHaveBeenCalledWith('secret123');
    expect(result.token).toBe('customer-token-1');
    expect(result.customer.email).toBe('sara@example.com');
  });

  it('rejects duplicate email within the tenant (409)', async () => {
    mockDb.customerFindMany.mockResolvedValue([customerRow]);
    await expect(service.register({
      firstName: 'Sara', lastName: 'Ali', email: 'sara@example.com', password: 'secret123',
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('logs a customer in and returns a token + profile', async () => {
    mockDb.customerFindMany.mockResolvedValue([customerRow]);
    const result = await service.login({ email: 'sara@example.com', password: 'secret123' });
    expect(auth.comparePassword).toHaveBeenCalledWith('secret123', 'argon2-hash');
    expect(result.token).toBe('customer-token-1');
    expect(result.customer.firstName).toBe('Sara');
  });

  it('rejects unknown email with a uniform 401', async () => {
    mockDb.customerFindMany.mockResolvedValue([]);
    await expect(service.login({ email: 'nobody@example.com', password: 'secret123' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a guest/legacy profile with no password (uniform 401)', async () => {
    mockDb.customerFindMany.mockResolvedValue([{ ...customerRow, passwordHash: null }]);
    await expect(service.login({ email: 'sara@example.com', password: 'secret123' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a wrong password (uniform 401)', async () => {
    (auth.comparePassword as jest.Mock).mockResolvedValue(false);
    await expect(service.login({ email: 'sara@example.com', password: 'wrongpass' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns the customer profile for /me', async () => {
    const profile = await service.getProfile('customer-1');
    expect(profile).toMatchObject({ id: 'customer-1', email: 'sara@example.com', firstName: 'Sara' });
  });

  it('updates the profile (name/phone)', async () => {
    const updated = { ...customerRow, firstName: 'Saraa', phoneNumber: '+96899999999' };
    mockDb.customerUpdate.mockResolvedValue(updated);
    const profile = await service.updateProfile('customer-1', { firstName: 'Saraa', phoneNumber: '+96899999999' });
    expect(mockDb.customerUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ firstName: 'Saraa', phoneNumber: '+96899999999' }),
    }));
    expect(profile.firstName).toBe('Saraa');
  });

  it('returns only the customer own order history (tenant-scoped query)', async () => {
    mockDb.orderFindMany.mockResolvedValue([
      {
        id: 'o1', orderNumber: 'ORD-2026-1', status: 'COMPLETED', type: 'DINE_IN',
        paymentMethod: 'CASH', total: 24, createdAt: new Date('2026-08-18T10:00:00.000Z'),
        orderItems: [{ quantity: 2, product: { name: 'Chicken Tikka' } }],
      },
    ]);
    const history = await service.getOrderHistory('customer-1');
    expect(mockDb.orderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { customerId: 'customer-1' },
    }));
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ orderNumber: 'ORD-2026-1', itemCount: 2 });
    expect((history[0] as { items: Array<{ name: string }> }).items[0].name).toBe('Chicken Tikka');
  });

  it('logs out by deleting the CSRF binding', async () => {
    const result = await service.logout('customer-1');
    expect(csrf.deleteToken).toHaveBeenCalledWith('customer-1');
    expect(result).toEqual({ success: true });
  });
});