import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminPanel } from './AdminPanel';

const defaultProps = {
  tenantId: 'tenant-1',
  initialBranchId: 'branch-1',
};

beforeEach(() => {
  (global.fetch as jest.Mock).mockReset();
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => [],
  });
  window.localStorage.getItem.mockReturnValue('mock-token');
});

it('renders without crashing', async () => {
  render(<AdminPanel {...defaultProps} />);
  expect(screen.getByRole('heading', { name: /Backoffice/ })).toBeTruthy();
});

it('fetches branches on mount', async () => {
  render(<AdminPanel {...defaultProps} />);
  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalled();
  });
});

it('renders backoffice header with tenant id', async () => {
  render(<AdminPanel {...defaultProps} />);
  const heading = screen.getByRole('heading', { name: /Backoffice/ });
  expect(heading.textContent).toContain('nant-1');
});

it('shows branch selector label', async () => {
  render(<AdminPanel {...defaultProps} />);
  expect(screen.getByText('Branch:')).toBeTruthy();
});

it('renders navigation tabs', async () => {
  render(<AdminPanel {...defaultProps} />);
  expect(screen.getByRole('button', { name: 'branches' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'menu' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'orders' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'metrics' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'kds' })).toBeTruthy();
});

it('shows tenant isolation badge', async () => {
  render(<AdminPanel {...defaultProps} />);
  expect(screen.getByText('Tenant Isolated')).toBeTruthy();
});

it('shows branches section on default tab', async () => {
  render(<AdminPanel {...defaultProps} />);
  expect(screen.getByText(/Branches/)).toBeTruthy();
});

it('shows footer', async () => {
  render(<AdminPanel {...defaultProps} />);
  expect(screen.getByText(/TanStack Query/)).toBeTruthy();
});
