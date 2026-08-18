import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CashierTerminal } from './CashierTerminal';

/* Capture the onNewOrder callback the notification manager would use. */
let onNewOrderCb: ((n: { orderId: string; orderNumber: string; branchId: string; status: string; total: number; taxAmount: number; subtotal: number; type: string }) => void) | null = null;

jest.mock('../lib/notification-manager', () => ({
  CashierNotificationClient: class {
    constructor(
      _apiUrl: string,
      _token: string,
      _branchId: string,
      onNewOrder: (n: { orderId: string; orderNumber: string; branchId: string; status: string; total: number; taxAmount: number; subtotal: number; type: string }) => void,
    ) {
      onNewOrderCb = onNewOrder;
    }
    connect(): void {}
    disconnect(): void {}
    acknowledgeOrder(): void {}
    openOrder(): void {}
    setVolume(): void {}
  },
  loadVolume: () => 0.5,
  saveVolume: () => {},
}));

const defaultProps = {
  tenantId: 'tenant-1',
  branchId: 'branch-1',
  apiUrl: 'http://localhost:8000',
};

describe('Cashier print flow (Phase 4 P3)', () => {
  beforeEach(() => {
    onNewOrderCb = null;
    (global.fetch as jest.Mock).mockReset();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => [] });
    window.localStorage.getItem.mockReset();
    window.localStorage.getItem.mockImplementation((key: string) =>
      key === 'accessToken' ? 'token-1' : null,
    );
    window.open = jest.fn();
  });

  it('opens the customer receipt print window from the order detail modal', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // products
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'order-1', orderNumber: 'ORD-2026-1' }) });

    render(<CashierTerminal {...defaultProps} />);

    await waitFor(() => expect(onNewOrderCb).not.toBeNull());
    onNewOrderCb!({ orderId: 'order-1', orderNumber: 'ORD-2026-1', branchId: 'branch-1', status: 'PENDING', total: 11, taxAmount: 1, subtotal: 10, type: 'DINE_IN' });

    await waitFor(() => expect(screen.getByText(/#ORD-2026-1/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/#ORD-2026-1/));
    await waitFor(() => expect(screen.getByText(/Order #ORD-2026-1/)).toBeInTheDocument());

    fireEvent.click(screen.getByText('Print Receipt'));
    expect(window.open).toHaveBeenCalledWith(
      '/receipt/order-1?kind=customer',
      '_blank',
      expect.any(String),
    );
  });

  it('opens the kitchen ticket print window from the order detail modal', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'order-1', orderNumber: 'ORD-2026-1' }) });

    render(<CashierTerminal {...defaultProps} />);

    await waitFor(() => expect(onNewOrderCb).not.toBeNull());
    onNewOrderCb!({ orderId: 'order-1', orderNumber: 'ORD-2026-1', branchId: 'branch-1', status: 'PENDING', total: 11, taxAmount: 1, subtotal: 10, type: 'DINE_IN' });

    await waitFor(() => expect(screen.getByText(/#ORD-2026-1/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/#ORD-2026-1/));
    await waitFor(() => expect(screen.getByText(/Order #ORD-2026-1/)).toBeInTheDocument());

    fireEvent.click(screen.getByText('Print Kitchen Ticket'));
    expect(window.open).toHaveBeenCalledWith(
      '/receipt/order-1?kind=kitchen',
      '_blank',
      expect.any(String),
    );
  });
});