import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { CashierTerminal } from './CashierTerminal';

const defaultProps = {
  tenantId: 'tenant-1',
  branchId: 'branch-1',
  apiUrl: 'http://localhost:8000',
};

beforeEach(() => {
  (global.fetch as jest.Mock).mockReset();
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => [],
  });
  window.localStorage.getItem.mockReset();
  window.localStorage.setItem.mockReset();
});

it('renders without crashing', async () => {
  render(<CashierTerminal {...defaultProps} />);
  await waitFor(() => {
    expect(screen.getByText(/Cashier Terminal PWA/)).toBeTruthy();
  });
});

it('fetches products on mount', async () => {
  render(<CashierTerminal {...defaultProps} />);
  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/menu/products'),
      expect.any(Object)
    );
  });
});

it('displays cart with empty state initially', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => [],
  });
  render(<CashierTerminal {...defaultProps} />);
  await waitFor(() => {
    expect(screen.getByText('Cart empty')).toBeTruthy();
  });
});

it('shows offline indicator when navigator.onLine is false', async () => {
  Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
  render(<CashierTerminal {...defaultProps} />);
  await waitFor(() => {
    expect(screen.getByText('Offline')).toBeTruthy();
  });
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
});

it('displays subtotal and total as $0.00', async () => {
  render(<CashierTerminal {...defaultProps} />);
  await waitFor(() => {
    const subtotals = screen.getAllByText('$0.00');
    expect(subtotals.length).toBeGreaterThanOrEqual(2);
  });
});

it('renders with correct tenant context', async () => {
  render(<CashierTerminal {...defaultProps} />);
  await waitFor(() => {
    expect(screen.getByText(/tenant-1/)).toBeTruthy();
  });
});

it('shows checkout button', async () => {
  render(<CashierTerminal {...defaultProps} />);
  await waitFor(() => {
    expect(screen.getByText(/Checkout/)).toBeTruthy();
  });
});

it('shows no products when API returns empty array', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => [],
  });
  render(<CashierTerminal {...defaultProps} />);
  await waitFor(() => {
    expect(screen.getByText('No products available')).toBeTruthy();
  });
});
