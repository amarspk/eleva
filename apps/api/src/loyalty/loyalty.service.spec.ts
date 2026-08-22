import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';

jest.mock('@zayjar/db', () => {
  const tx = { customer: { findUnique: jest.fn(), update: jest.fn() }, discount: { create: jest.fn() }, loyaltyTransaction: { create: jest.fn() } };
  return {
    prisma: {
      customer: { findUnique: jest.fn(), update: jest.fn() },
      loyaltyTransaction: { findFirst: jest.fn(), findMany: jest.fn() },
    },
    dbTenantContext: {
      getStore: () => ({ tenantId: 'tenant-1' }),
      run: jest.fn((c: unknown, fn: () => unknown) => fn()),
    },
    __m: { tx },
  };
});

type LoyaltyTx = {
  customer: { findUnique: jest.Mock; update: jest.Mock };
  discount: { create: jest.Mock };
  loyaltyTransaction: { create: jest.Mock };
};
type LoyaltyPrisma = {
  customer: { findUnique: jest.Mock; update: jest.Mock };
  loyaltyTransaction: { findFirst: jest.Mock; findMany: jest.Mock };
  loyaltyRule: { findUnique: jest.Mock; upsert: jest.Mock };
  $transaction: jest.Mock;
};
const mockDb = jest.requireMock('@zayjar/db') as {
  prisma: LoyaltyPrisma;
  __m: { tx: LoyaltyTx };
};
mockDb.prisma.loyaltyRule = {
  findUnique: jest.fn(),
  upsert: jest.fn(),
};
mockDb.prisma.$transaction = jest.fn((fn: (tx: LoyaltyTx) => unknown) => fn(mockDb.__m.tx));

const ruleRow = {
  id: 'rule-1', tenantId: 'tenant-1',
  earnRate: 10, earnMinOrderAmount: 5, minRedeemPoints: 50, redeemRate: 0.05,
};

const customerRow = {
  id: 'customer-1', tenantId: 'tenant-1', firstName: 'Sara', lastName: 'Ali',
  email: 'sara@example.com', phoneNumber: null, passwordHash: null,
  loyaltyPoints: 200, createdAt: new Date(), updatedAt: new Date(),
};

describe('LoyaltyService (Phase 4 — Loyalty)', () => {
  let service: LoyaltyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LoyaltyService();
  });

  // ── Balance ──────────────────────────────────────────────────────
  it('returns the customer own loyalty balance', async () => {
    (mockDb.prisma.customer.findUnique as jest.Mock).mockResolvedValue(customerRow);
    const result = await service.getBalance('customer-1');
    expect(result).toEqual({ balance: 200 });
  });

  it('throws 404 for a non-existent customer (tenant-scoped)', async () => {
    (mockDb.prisma.customer.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.getBalance('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  // ── History ──────────────────────────────────────────────────────
  it('returns own loyalty transaction history', async () => {
    (mockDb.prisma.loyaltyTransaction.findMany as jest.Mock).mockResolvedValue([
      { id: 'tx1', type: 'EARNED', points: 50, balanceAfter: 250, description: 'test', orderId: null, createdAt: new Date() },
    ]);
    const history = await service.getHistory('customer-1');
    expect(history).toHaveLength(1);
    expect(history[0].type).toBe('EARNED');
  });

  // ── Redeem (atomic, balance-gated) ─────────────────────────────
  it('redeems points and creates a one-time discount code', async () => {
    (mockDb.prisma.loyaltyRule.findUnique as jest.Mock).mockResolvedValue(ruleRow);
    const tx = mockDb.__m.tx;
    tx.customer.findUnique.mockResolvedValue({ ...customerRow, loyaltyPoints: 200 });

    const result = await service.redeem('customer-1', 100);
    expect(result.success).toBe(true);
    expect(result.discountCode).toContain('LOYALTY-');
    expect(result.discountValue).toBe(5); // 100 * 0.05 = 5
    expect(result.balanceAfter).toBe(100);

    // Balance updated
    expect(tx.customer.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { loyaltyPoints: 100 },
    }));
    // Transaction created with negative points
    expect(tx.loyaltyTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({
        type: 'REDEEMED',
        points: -100,
        balanceAfter: 100,
      }) }));
    // Discount created
    expect(tx.discount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({
        type: 'FIXED',
      }) }));
  });

  it('rejects redeemal when balance is insufficient', async () => {
    (mockDb.prisma.loyaltyRule.findUnique as jest.Mock).mockResolvedValue(ruleRow);
    const tx = mockDb.__m.tx;
    tx.customer.findUnique.mockResolvedValue({ ...customerRow, loyaltyPoints: 20 });

    await expect(service.redeem('customer-1', 100)).rejects.toBeInstanceOf(BadRequestException);
    // Update should NOT be called
    expect(tx.customer.update).not.toHaveBeenCalled();
  });

  it('rejects reation when no rule is configured', async () => {
    (mockDb.prisma.loyaltyRule.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.redeem('customer-1', 50)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects redemption below minimum threshold', async () => {
    (mockDb.prisma.loyaltyRule.findUnique as jest.Mock).mockResolvedValue({ ...ruleRow, minRedeemPoints: 50 });
    await expect(service.redeem('customer-1', 10)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects redemption that produces zero discount value', async () => {
    (mockDb.prisma.loyaltyRule.findUnique as jest.Mock).mockResolvedValue({ ...ruleRow, redeemRate: 0 });
    await expect(service.redeem('customer-1', 50)).rejects.toBeInstanceOf(BadRequestException);
  });

  // ── Eearnings (idempotent, guarded) ─────────────────────────────
  it('aards points for a completed order (atomic, idempotent)', async () => {
    (mockDb.prisma.loyaltyTransaction.findFirst as jest.Mock).mockResolvedValue(null); // No existing earn
    (mockDb.prisma.loyaltyRule.findUnique as jest.Mock).mockResolvedValue(ruleRow);
    const tx = mockDb.__m.tx;
    tx.customer.findUnique.mockResolvedValue({ ...customerRow, loyaltyPoints: 200 });

    await service.awardPointsForOrder('tenant-1', 'order-1', 'customer-1', 20);

    expect(tx.customer.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { loyaltyPoints: 400 }, // 200 + (20 * 10)
    }));
    expect(tx.loyaltyTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({
        type: 'EARNED',
        points: 200,
      }) }));
  });

  it('does not duplicate points if already earned (idemotent)', async () => {
    (mockDb.prisma.loyaltyTransaction.findFirst as jest.Mock).mockResolvedValue({ id: 'existing-earn' });
    await service.awardPointsForOrder('tenant-1', 'order-1', 'customer-1', 20);

    expect(mockDb.__m.tx.customer.update).not.toHaveBeenCalled();
  });

  it('does not earn points for orders below minimum amount', async () => {
    (mockDb.prisma.loyaltyTransaction.findFirst as jest.Mock).mockResolvedValue(null);
    (mockDb.prisma.loyaltyRule.findUnique as jest.Mock).mockResolvedValue(ruleRow);

    await service.awardPointsForOrder('tenant-1', 'order-1', 'customer-1', 2); // total 2 < min 5

    expect(mockDb.__m.tx.customer.update).not.toHaveBeenCalled();
  });

  it('does nothing when no rule is configured (graceful)', async () => {
    (mockDb.prisma.loyaltyTransaction.findFirst as jest.Mock).mockResolvedValue(null);
    (mockDb.prisma.loyaltyRule.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.awardPointsForOrder('tenant-1', 'order-1', 'customer-1', 20)).resolves.toBeUndefined();
    expect(mockDb.__m.tx.customer.update).not.toHaveBeenCalled();
  });

  it('does nothing when order has no customer (guest)', async () => {
    (mockDb.prisma.loyaltyTransaction.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(service.awardPointsForOrder('tenant-1', 'order-1', undefined, 20)).resolves.toBeUndefined();
    expect(mockDb.__m.tx.customer.update).not.toHaveBeenCalled();
  });

  // ─ Staff rule management ─────────────────────────────────────────────────
  it('upserts the tenant loyalty rule', async () => {
    (mockDb.prisma.loyaltyRule.upsert as jest.Mock).mockResolvedValue(ruleRow);
    const result = await service.upsertRule('tenant-1', { earnRate: 10, redeemRate: 0.05 });
    expect(result.earnRate).toBe(10);
  });
});