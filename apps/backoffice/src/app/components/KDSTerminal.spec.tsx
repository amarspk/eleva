import React from 'react';
import { render, screen } from '@testing-library/react';
import { KDSTerminal } from './KDSTerminal';

const defaultProps = {
  branchId: 'branch-1',
  accessToken: 'mock-token-123',
  tenantId: 'tenant-1',
};

beforeEach(() => {
  (global.fetch as jest.Mock).mockReset();
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => [],
  });
});

it('renders without crashing', async () => {
  render(<KDSTerminal {...defaultProps} />);
  expect(screen.getByText(/kds|kitchen/i)).toBeTruthy();
});

it('shows disconnected state initially', () => {
  render(<KDSTerminal {...defaultProps} />);
  expect(screen.getByText(/disconnected/i)).toBeTruthy();
});

it('renders filter buttons', () => {
  render(<KDSTerminal {...defaultProps} />);
  expect(screen.getByText(/all/i)).toBeTruthy();
  expect(screen.getByText(/pending/i)).toBeTruthy();
  expect(screen.getByText(/preparing/i)).toBeTruthy();
  expect(screen.getByText(/cooked/i)).toBeTruthy();
});

it('displays branch context', () => {
  render(<KDSTerminal {...defaultProps} />);
  expect(screen.getByText(new RegExp(defaultProps.branchId))).toBeTruthy();
});
