import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { DashboardMetrics } from './DashboardMetrics';

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
    accessToken: 'metrics-token',
    csrfToken: 'metrics-csrf',
    tenantId: 'tenant-metrics',
    user: JSON.stringify({ id: 'user-metrics', tenantId: 'tenant-metrics', email: 'owner@example.com' }),
  });
  (window.localStorage.getItem as jest.Mock).mockImplementation((key: string) => store[key] ?? null);
  (window.localStorage.removeItem as jest.Mock).mockImplementation((key: string) => {
    delete store[key];
  });
});

describe('DashboardMetrics A4 API wiring', () => {
  it('uses the real menu products endpoint and authenticated client', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/v1/orders') {
        return jsonResponse([
          { id: 'o1', orderNumber: '1', total: '10.25', createdAt: '', status: 'PENDING' },
          { id: 'o2', orderNumber: '2', total: 4.75, createdAt: '', status: 'PENDING' },
        ]);
      }
      if (url === '/api/v1/menu/products') {
        return jsonResponse([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]);
      }
      if (url === '/api/v1/branches') {
        return jsonResponse([{ id: 'b1' }]);
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    render(<DashboardMetrics tenantId="tenant-metrics" />);

    expect(await screen.findByText('15.00')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toEqual([
      '/api/v1/orders',
      '/api/v1/menu/products',
      '/api/v1/branches',
    ]);
    expect(urls).not.toContain('/api/v1/products');
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.headers.Authorization).toBe('Bearer metrics-token');
      expect(init.headers['X-Tenant-ID']).toBe('tenant-metrics');
    }
  });

  it('shows the centralized session-expiry failure and clears rejected credentials', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Unauthorized' }, 401));

    render(<DashboardMetrics tenantId="tenant-metrics" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Your session has expired. Sign in again.');
    await waitFor(() => expect(store.accessToken).toBeUndefined());
  });
});
