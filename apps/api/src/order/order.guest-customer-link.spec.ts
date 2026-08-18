import { OrderService } from './order.service';
import { JwtService } from '@nestjs/jwt';
import type { CreateOrderRequestDto } from './dto/create-order-request.dto';

jest.mock('@zayjar/db', () => {
  const tableFindByQrCodeToken = jest.fn();
  const tenantFindUnique = jest.fn();
  const customerFindUnique = jest.fn();
  return {
    prisma: {
      tenant: { findUnique: tenantFindUnique },
      customer: { findUnique: customerFindUnique },
    },
    dbTenantContext: {
      run: jest.fn((_c: unknown, fn: () => unknown) => fn()),
    },
    TenantTableRepository: class {
      findByQrCodeToken = tableFindByQrCodeToken;
    },
    TenantOrderRepository: class {},
    TenantBranchRepository: class {},
    TenantProductRepository: class {},
    TenantProductSizeRepository: class {},
    TenantAddonItemRepository: class {},
    TenantInvoiceRepository: class {},
    TenantRestaurantRepository: class {},
    TenantKitchenQueueRepository: class {},
    __m: { tableFindByQrCodeToken, tenantFindUnique, customerFindUnique },
  };
});

jest.mock('@nestjs/jwt', () => ({
  JwtService: class {
    verifyAsync = jest.fn();
  },
}));

const mockDb = jest.requireMock('@zayjar/db').__m as {
  tableFindByQrCodeToken: jest.Mock;
  tenantFindUnique: jest.Mock;
  customerFindUnique: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JwtService: MockJwtService } = jest.requireMock('@nestjs/jwt') as {
  JwtService: new () => { verifyAsync: jest.Mock };
};

const dto = {
  branchId: 'branch-1',
  qrCodeToken: 'qr-token-1',
  type: 'DINE_IN',
  paymentMethod: 'CASH',
  items: [{ productId: 'p1', quantity: 1 }],
} as unknown as CreateOrderRequestDto;

describe('OrderService — optional customer linking at guest checkout (Phase 4)', () => {
  let service: OrderService;
  let jwt: { verifyAsync: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    jwt = new MockJwtService();
    service = new OrderService(jwt as unknown as JwtService);
    mockDb.tableFindByQrCodeToken.mockResolvedValue({ id: 'table-1', branchId: 'branch-1' });
    mockDb.tenantFindUnique.mockResolvedValue({ status: 'ACTIVE' });
    // createOrder is replaced by a spy so we only exercise the guest wrapper.
    jest.spyOn(OrderService.prototype, 'createOrder').mockResolvedValue({ id: 'order-1' });
  });

  it('links the order to the customer when a valid customer token is supplied', async () => {
    jwt.verifyAsync.mockResolvedValue({ type: 'customer', sub: 'customer-1', tenantId: 'tenant-1' });
    mockDb.customerFindUnique.mockResolvedValue({ id: 'customer-1', tenantId: 'tenant-1' });

    await service.createGuestOrder(dto, 'tenant-1', 'customer-token');

    expect(jwt.verifyAsync).toHaveBeenCalledWith('customer-token', expect.objectContaining({ secret: expect.any(String) }));
    expect(mockDb.customerFindUnique).toHaveBeenCalledWith({ where: { id: 'customer-1' } });
    expect(OrderService.prototype.createOrder).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      undefined,
      'customer-1',
    );
  });

  it('falls back to guest checkout when the token is invalid/expired (never blocks ordering)', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));

    await service.createGuestOrder(dto, 'tenant-1', 'garbage-token');

    expect(mockDb.customerFindUnique).not.toHaveBeenCalled();
    expect(OrderService.prototype.createOrder).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      undefined,
      undefined,
    );
  });

  it('falls back to guest checkout when the token is not a customer token', async () => {
    jwt.verifyAsync.mockResolvedValue({ type: 'staff', sub: 'user-1' });

    await service.createGuestOrder(dto, 'tenant-1', 'staff-token');

    expect(mockDb.customerFindUnique).not.toHaveBeenCalled();
    expect(OrderService.prototype.createOrder).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      undefined,
      undefined,
    );
  });

  it('keeps pure guest checkout when no token is supplied', async () => {
    await service.createGuestOrder(dto, 'tenant-1');

    expect(jwt.verifyAsync).not.toHaveBeenCalled();
    expect(OrderService.prototype.createOrder).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      undefined,
      undefined,
    );
  });

  it('does not link a customer that does not exist in this tenant (guest fallback)', async () => {
    jwt.verifyAsync.mockResolvedValue({ type: 'customer', sub: 'foreign-customer' });
    mockDb.customerFindUnique.mockResolvedValue(null);

    await service.createGuestOrder(dto, 'tenant-1', 'token');

    expect(OrderService.prototype.createOrder).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      undefined,
      undefined,
    );
  });
});