import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WalletService } from './wallet.service';

jest.mock('@zayjar/db', () => {
  const customerWalletFindUnique = jest.fn();
  const customerWalletCreate = jest.fn();
  const customerWalletUpdate = jest.fn();
  const walletTransactionFindMany = jest.fn();
  const walletTransactionCreate = jest.fn();
  const customerFindUnique = jest.fn();
  return {
    prisma: {
      customer: { findUnique: customerFindUnique },
      customerWallet: { findUnique: customerWalletFindUnique, create: customerWalletCreate, update: customerWalletUpdate },
      walletTransaction: { findMany: walletTransactionFindMany, create: walletTransactionCreate },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn({
        customerWallet: { findUnique: customerWalletFindUnique, update: customerWalletUpdate },
        walletTransaction: { create: walletTransactionCreate },
      })),
    },
    dbTenantContext: {
      getStore: () => ({ tenantId: 'tenant-1' }),
      run: jest.fn((c: unknown, fn: () => unknown) => fn()),
    },
    __m: { customerWalletFindUnique, customerWalletCreate, customerWalletUpdate, walletTransactionFindMany, walletTransactionCreate, customerFindUnique },
  };
});

const mockDb = jest.requireMock('@zayjar/db').__m as {
  customerWalletFindUnique: jest.Mock;
  customerWalletCreate: jest.Mock;
  customerWalletUpdate: jest.Mock;
  walletTransactionFindMany: jest.Mock;
  walletTransactionCreate: jest.Mock;
  customerFindUnique: jest.Mock;
};

const walletRow = { id: 'w1', customerId: 'customer-1', tenantId: 'tenant-1', balance: { toString: () => '50', toNumber: () => 50 } };
const walletRow0 = { ...walletRow, balance: { toString: () => '0', toNumber: () => 0 } };

describe('WalletService (Phase 4 — Store Credit)', () => {
  let service: WalletService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WalletService();
    mockDb.customerWalletFindUnique.mockResolvedValue(walletRow);
    mockDb.customerWalletCreate.mockResolvedValue(walletRow);
    mockDb.customerWalletUpdate.mockResolvedValue({});
    mockDb.walletTransactionFindMany.mockResolvedValue([]);
    mockDb.walletTransactionCreate.mockResolvedValue({});
    mockDb.customerFindUnique.mockResolvedValue({ id: 'customer-1' });
  });

  it('returns zero balance for a customer with no wallet (creates one)', async () => {
    mockDb.customerWalletFindUnique.mockResolvedValue(null);
    mockDb.customerWalletCreate.mockResolvedValue({ id: 'w1', balance: 0 });
    const result = await service.getMyWallet('customer-1');
    expect(mockDb.customerWalletCreate).toHaveBeenCalled();
    expect(result.balance).toBe(0);
  });

  it('returns the balance and transaction history', async () => {
    const result = await service.getMyWallet('customer-1');
    expect(result.balance).toBe(50);
    expect(mockDb.walletTransactionFindMany).toHaveBeenCalled();
  });

  it('grants credit to a customer and updates the balance', async () => {
    const result = await service.grantCredit('tenant-1', 'customer-1', 10, 'Bonus');
    expect(mockDb.customerWalletUpdate).toHaveBeenCalled();
    expect(mockDb.walletTransactionCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'CREDIT', amount: 10 }),
    }));
    expect(result.balance).toBe(60);
  });

  it('rejects a zero/negative credit amount', async () => {
    await expect(service.grantCredit('tenant-1', 'customer-1', 0, '')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.grantCredit('tenant-1', 'customer-1', -5, '')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects credit for a non-existent customer', async () => {
    mockDb.customerFindUnique.mockResolvedValue(null);
    await expect(service.grantCredit('tenant-1', 'missing', 10, '')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deducts wallet balance for an order (useWalletForOrder)', async () => {
    const result = await service.useWalletForOrder('tenant-1', 'customer-1', 'order-1', 30);
    expect(result.walletUsed).toBe(30);
    expect(result.remainingTotal).toBe(0);
    expect(mockDb.customerWalletUpdate).toHaveBeenCalled();
  });

  it('uses remaining wallet balance when order total exceeds wallet', async () => {
    mockDb.customerWalletFindUnique.mockResolvedValueOnce({ ...walletRow, balance: 10 });
    const result = await service.useWalletForOrder('tenant-1', 'customer-1', 'order-1', 30);
    expect(result.walletUsed).toBe(10);
    expect(result.remainingTotal).toBe(20);
  });

  it('does nothing when wallet balance is zero', async () => {
    mockDb.customerWalletFindUnique.mockResolvedValueOnce({ ...walletRow, balance: 0 });
    const result = await service.useWalletForOrder('tenant-1', 'customer-1', 'order-1', 30);
    expect(result.walletUsed).toBe(0);
    expect(mockDb.customerWalletUpdate).not.toHaveBeenCalled();
  });
});