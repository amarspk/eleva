import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OrdersManager } from './OrdersManager';

const fetchMock = global.fetch as jest.Mock;
const store: Record<string, string> = {};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  Object.assign(store, {
    accessToken: 'orders-token',
    csrfToken: 'orders-csrf',
    tenantId: 'tenant-orders',
    user: JSON.stringify({ id: 'user-orders', tenantId: 'tenant-orders', email: 'owner@example.com' }),
  });
  (window.localStorage.getItem as jest.Mock).mockImplementation((key: string) => store[key] ?? null);
});

afterEach(() => {
  jest.useRealTimers();
});

const regularOrder = {
  id: 'order-1',
  orderNumber: 'ORD-001',
  branchId: 'branch-12345678',
  paymentMethod: 'CASH',
  total: '12.50',
  createdAt: '2026-08-13T12:00:00.000Z',
  status: 'PENDING',
  isPreorder: false,
  orderItems: [{ quantity: 2, productId: 'product-abcdef' }],
};

const preorder = {
  ...regularOrder,
  id: 'order-2',
  orderNumber: 'ORD-002',
  isPreorder: true,
  scheduledAt: '2026-08-14T12:00:00.000Z',
};

describe('OrdersManager A4 API wiring', () => {
  it('loads branch orders through the authenticated API client', async () => {
    fetchMock.mockResolvedValue(jsonResponse([regularOrder]));

    render(<OrdersManager tenantId="tenant-orders" branchId="branch-1" />);

    expect(await screen.findByText(/ORD-001/)).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/orders?branchId=branch-1');
    expect(init.headers.Authorization).toBe('Bearer orders-token');
    expect(init.headers['X-Tenant-ID']).toBe('tenant-orders');
    expect(init.credentials).toBe('include');
  });

  it('preserves the pre-order filter', async () => {
    fetchMock.mockResolvedValue(jsonResponse([regularOrder, preorder]));
    render(<OrdersManager tenantId="tenant-orders" />);
    await screen.findByText(/ORD-001/);

    fireEvent.click(screen.getByRole('button', { name: 'Pre-orders' }));

    expect(screen.queryByText(/ORD-001/)).not.toBeInTheDocument();
    expect(screen.getByText(/ORD-002/)).toBeInTheDocument();
  });

  it('surfaces API failures instead of silently replacing orders', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Order access denied' }, 403));
    render(<OrdersManager tenantId="tenant-orders" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Order access denied');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});
