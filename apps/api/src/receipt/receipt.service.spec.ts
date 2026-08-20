import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ReceiptService } from './receipt.service';

jest.mock('@zayjar/db', () => {
  const orderFindUnique = jest.fn();
  const tenantFindUnique = jest.fn();
  const designFindUnique = jest.fn();
  return {
    prisma: {
      order: { findUnique: orderFindUnique },
      tenant: { findUnique: tenantFindUnique },
      tenantDesign: { findUnique: designFindUnique },
    },
    dbTenantContext: {
      run: jest.fn((_ctx: unknown, fn: () => unknown) => fn()),
      getStore: jest.fn(() => ({ tenantId: 'tenant-1' })),
    },
    __mockOrderFindUnique: orderFindUnique,
    __mockTenantFindUnique: tenantFindUnique,
    __mockDesignFindUnique: designFindUnique,
  };
});

const mockDb = jest.requireMock('@zayjar/db') as {
  __mockOrderFindUnique: jest.Mock;
  __mockTenantFindUnique: jest.Mock;
  __mockDesignFindUnique: jest.Mock;
};

const baseOrder = {
  id: 'order-1',
  tenantId: 'tenant-1',
  branchId: 'branch-1',
  orderNumber: 'ORD-2026-12345',
  type: 'DINE_IN',
  status: 'COMPLETED',
  paymentMethod: 'CASH',
  subtotal: 24,
  taxAmount: 2.4,
  discountAmount: 2.4,
  total: 24,
  specialNotes: 'No onions',
  createdAt: new Date('2026-08-18T14:30:00.000Z'),
};

const hydratedOrder = {
  id: 'order-1',
  orderNumber: 'ORD-2026-12345',
  type: 'DINE_IN',
  status: 'COMPLETED',
  paymentMethod: 'CASH',
  subtotal: 24,
  taxAmount: 2.4,
  discountAmount: 2.4,
  total: 24,
  specialNotes: 'No onions',
  createdAt: new Date('2026-08-18T14:30:00.000Z'),
  branch: {
    name: 'Riyadh - Olaya',
    address: 'Olaya St',
    phoneNumber: '+966501234567',
    restaurant: { name: 'Albaik Chicken', currency: 'SAR' },
  },
  orderItems: [
    {
      id: 'oi-1',
      quantity: 2,
      unitPrice: 12,
      totalPrice: 24,
      product: { name: 'Chicken Tikka' },
      size: { name: 'Large' },
      variant: null,
      orderItemAddons: [{ addonItem: { name: 'Cheese' } }],
    },
  ],
};

describe('ReceiptService (Phase 4 P3 — Printing & Receipts)', () => {
  let service: ReceiptService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReceiptService();
    mockDb.__mockOrderFindUnique.mockResolvedValueOnce(baseOrder).mockResolvedValueOnce(hydratedOrder);
    mockDb.__mockTenantFindUnique.mockResolvedValue({
      name: 'Albaik Demo',
      logoUrl: 'https://cdn.example.com/logo.png',
      primaryColor: '#ff5733',
    });
    mockDb.__mockDesignFindUnique.mockResolvedValue({
      published: { receipt: { language: 'ar', showLogo: false, footerMessage: 'شكراً' } },
    });
  });

  it('assembles receipt data from the real order (tenant-scoped lookup)', async () => {
    const data = await service.getReceiptData('order-1') as Record<string, unknown>;
    const order = data.order as Record<string, unknown>;
    const items = order.items as Array<Record<string, unknown>>;

    expect(data.tenant).toMatchObject({ name: 'Albaik Demo', currency: 'SAR' });
    expect(data.branch).toMatchObject({ name: 'Riyadh - Olaya', address: 'Olaya St' });
    expect(order.orderNumber).toBe('ORD-2026-12345');
    expect(order.total).toBe(24);
    expect(items[0]).toMatchObject({ name: 'Chicken Tikka', quantity: 2, size: 'Large' });
    expect(items[0].addons).toEqual(['Cheese']);
  });

  it('applies the published receipt config (language ar + toggles)', async () => {
    const data = await service.getReceiptData('order-1') as Record<string, unknown>;
    expect(data.config).toMatchObject({ language: 'ar', showLogo: false, footerMessage: 'شكراً' });
    // untouched defaults preserved
    const config = data.config as Record<string, unknown>;
    expect(config.showDateTime).toBe(true);
  });

  it('falls back to default config when no design is published', async () => {
    mockDb.__mockDesignFindUnique.mockResolvedValue(null);
    const data = await service.getReceiptData('order-1') as Record<string, unknown>;
    expect(data.config).toMatchObject({ language: 'en', showLogo: true });
  });

  it('throws 404 for a missing order (no existence oracle)', async () => {
    mockDb.__mockOrderFindUnique.mockReset();
    mockDb.__mockOrderFindUnique.mockResolvedValue(null);
    await expect(service.getReceiptData('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('enforces branch isolation for branch-scoped staff (P0)', async () => {
    mockDb.__mockOrderFindUnique.mockReset();
    mockDb.__mockOrderFindUnique.mockResolvedValue(baseOrder);
    await expect(service.getReceiptData('order-1', ['branch-other'])).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows access for staff assigned to the order branch', async () => {
    mockDb.__mockOrderFindUnique.mockReset();
    mockDb.__mockOrderFindUnique.mockResolvedValueOnce(baseOrder).mockResolvedValueOnce(hydratedOrder);
    const data = await service.getReceiptData('order-1', ['branch-1']);
    expect(data.order).toBeTruthy();
  });

  it('allows unrestricted access for tenant-wide staff (no branch list)', async () => {
    mockDb.__mockOrderFindUnique.mockReset();
    mockDb.__mockOrderFindUnique.mockResolvedValueOnce(baseOrder).mockResolvedValueOnce(hydratedOrder);
    const data = await service.getReceiptData('order-1', []);
    expect(data.order).toBeTruthy();
  });

  it('returns 404 for an order that belongs to another tenant (findUnique is not ALS-scoped)', async () => {
    mockDb.__mockOrderFindUnique.mockReset();
    mockDb.__mockOrderFindUnique.mockResolvedValue({ ...baseOrder, tenantId: 'tenant-OTHER' });
    await expect(service.getReceiptData('order-1', [])).rejects.toBeInstanceOf(NotFoundException);
  });
});