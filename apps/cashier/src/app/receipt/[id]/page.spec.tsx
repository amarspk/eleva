import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ReceiptPrintPage from './page';

let mockKind = 'customer';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'order-1' }),
  useSearchParams: () => new URLSearchParams(`kind=${mockKind}`),
}));

jest.mock('@zayjar/receipts', () => {
  const actual = jest.requireActual('@zayjar/receipts');
  return {
    ...actual,
    CustomerReceipt: ({ data }: { data: { tenant: { name: string } } }) => (
      <div data-testid="customer-receipt">{data.tenant.name}</div>
    ),
    KitchenTicket: ({ data }: { data: { tenant: { name: string } } }) => (
      <div data-testid="kitchen-ticket">{data.tenant.name}</div>
    ),
  };
});

jest.mock('../../lib/auth', () => ({
  resolveApiBase: () => 'http://localhost:8000',
}));

const receiptData = {
  config: { language: 'en', footerMessage: 'Thanks' },
  tenant: { name: 'Albaik Demo', currency: 'SAR' },
  branch: { name: 'Riyadh' },
  order: {
    id: 'order-1', orderNumber: 'ORD-2026-1', type: 'DINE_IN', status: 'COMPLETED',
    subtotal: 10, taxAmount: 1, discountAmount: 0, total: 11, createdAt: '2026-08-18T10:00:00.000Z',
    items: [{ name: 'Chicken', quantity: 1, unitPrice: 10, totalPrice: 10 }],
  },
};

describe('Receipt print page (Phase 4 P3)', () => {
  beforeEach(() => {
    mockKind = 'customer';
    (global.fetch as jest.Mock).mockReset();
    window.localStorage.getItem.mockReset();
    window.localStorage.getItem.mockImplementation((key: string) => {
      if (key === 'accessToken') {
        return 'token-1';
      }
      if (key === 'tenantId') {
        return 'tenant-1';
      }
      return null;
    });
    window.print = jest.fn();
  });

  it('fetches the real receipt endpoint and renders the customer receipt', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => receiptData });
    render(<ReceiptPrintPage />);
    await waitFor(() => {
      expect(screen.getByTestId('customer-receipt')).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/orders/order-1/receipt',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token-1' }) }),
    );
  });

  it('shows an error message when the fetch fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 403 });
    render(<ReceiptPrintPage />);
    await waitFor(() => {
      expect(screen.getByText(/HTTP 403/)).toBeInTheDocument();
    });
  });

  it('renders the kitchen ticket when kind=kitchen', async () => {
    mockKind = 'kitchen';
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => receiptData });
    render(<ReceiptPrintPage />);
    await waitFor(() => {
      expect(screen.getByTestId('kitchen-ticket')).toBeInTheDocument();
    });
  });
});