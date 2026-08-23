import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { BackofficeShell } from './BackofficeShell';
import type { StaffSession } from '../lib/auth';

const mockLoadSession = jest.fn();

jest.mock('../lib/auth', () => ({
  loadSession: () => mockLoadSession(),
  clearSession: jest.fn(),
}));

jest.mock('./modules/ProductsModule', () => ({ ProductsModule: () => <div>Products module</div> }));
jest.mock('./modules/CategoriesModule', () => ({ CategoriesModule: () => <div>Categories module</div> }));
jest.mock('./modules/BranchesModule', () => ({ BranchesModule: () => <div>Branches module</div> }));
jest.mock('./modules/TablesModule', () => ({ TablesModule: () => <div>Tables module</div> }));
jest.mock('./modules/CustomersModule', () => ({ CustomersModule: () => <div>Customers module</div> }));
jest.mock('./modules/StaffModule', () => ({ StaffModule: () => <div>Staff module</div> }));
jest.mock('./DesignBuilder', () => ({ DesignBuilder: () => <div>Design module</div> }));
jest.mock('./MediaLibrary', () => ({ MediaLibrary: () => <div>Media module</div> }));
jest.mock('./OrdersManager', () => ({ OrdersManager: () => <div>Orders module</div> }));
jest.mock('./ReceiptDesigner', () => ({ ReceiptDesigner: () => <div>Receipts module</div> }));
jest.mock('./LoyaltySettings', () => ({ LoyaltySettings: () => <div>Loyalty settings</div> }));
jest.mock('./WelcomeOfferSettings', () => ({ WelcomeOfferSettings: () => <div>Welcome settings</div> }));
jest.mock('./WalletManager', () => ({ WalletManager: () => <div>Wallet settings</div> }));
jest.mock('./ComplaintManager', () => ({ ComplaintManager: () => <div>Complaints module</div> }));
jest.mock('./RatingsManager', () => ({ RatingsManager: () => <div>Ratings module</div> }));
jest.mock('./DashboardMetrics', () => ({ DashboardMetrics: () => <div>Dashboard metrics</div> }));
jest.mock('./ExecutiveOffice', () => ({ ExecutiveOffice: () => <div>Agent console</div> }));

function session(partial: { roles: string[]; permissions: string[]; email?: string; tenantId?: string | null }): StaffSession {
  return {
    accessToken: 'tok',
    csrfToken: 'csrf',
    expiresIn: 900,
    tenantId: partial.tenantId === undefined ? 'tenant-1' : partial.tenantId,
    user: {
      id: 'u1',
      tenantId: partial.tenantId === undefined ? 'tenant-1' : partial.tenantId,
      email: partial.email ?? 'staff@example.com',
      roles: partial.roles,
      permissions: partial.permissions,
      firstName: 'A',
      lastName: 'B',
      mfaEnabled: false,
    },
  };
}

describe('BackofficeShell navigation visibility', () => {
  beforeEach(() => {
    mockLoadSession.mockReset();
    window.localStorage.clear();
  });

  it('renders restaurant-owner tabs from owner grants', () => {
    mockLoadSession.mockReturnValue(session({
      roles: ['RESTAURANT_OWNER'],
      permissions: [
        'product:read', 'category:read', 'branch:read', 'table:read', 'order:read',
        'customer:read', 'user:read', 'tenant:read', 'tenant:update', 'product:update',
      ],
    }));
    render(<BackofficeShell />);
    expect(screen.getByRole('button', { name: 'Staff' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Design / Website' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Products' })).toBeInTheDocument();
  });

  it('hides staff and design for a manager', () => {
    mockLoadSession.mockReturnValue(session({
      roles: ['MANAGER'],
      permissions: [
        'product:read', 'category:read', 'branch:read', 'table:read', 'order:read', 'customer:read', 'product:update',
      ],
    }));
    render(<BackofficeShell />);
    expect(screen.getByRole('button', { name: 'Products' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Staff' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Design / Website' })).not.toBeInTheDocument();
    expect(screen.queryByText('Staff module')).not.toBeInTheDocument();
  });

  it('shows cashier order/customer surfaces and hides branches/staff', () => {
    mockLoadSession.mockReturnValue(session({
      roles: ['CASHIER'],
      permissions: ['order:read', 'product:read', 'table:read', 'customer:read'],
    }));
    render(<BackofficeShell />);
    expect(screen.getByRole('button', { name: 'Orders' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Customers' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Branches' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Staff' })).not.toBeInTheDocument();
  });

  it('shows kitchen product/order tabs only', () => {
    mockLoadSession.mockReturnValue(session({
      roles: ['KITCHEN_STAFF'],
      permissions: ['order:read', 'product:read'],
    }));
    render(<BackofficeShell />);
    expect(screen.getByRole('button', { name: 'Orders' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Products' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Customers' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('shows the full set to a platform owner even with an empty permission array', () => {
    mockLoadSession.mockReturnValue(session({
      roles: ['PLATFORM_OWNER'],
      permissions: [],
      tenantId: null,
      email: 'platform@zayjar.ai',
    }));
    render(<BackofficeShell />);
    expect(screen.getByRole('button', { name: 'Staff' })).toBeInTheDocument();
    expect(screen.getAllByText('Executive Office').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Executive Office' }));
    expect(screen.getByText('Agent console')).toBeInTheDocument();
  });

  it('does not show the Agent console tab to a restaurant owner', () => {
    mockLoadSession.mockReturnValue(session({
      roles: ['RESTAURANT_OWNER'],
      permissions: ['order:read', 'product:read', 'agent:read'],
    }));
    render(<BackofficeShell />);
    expect(screen.queryByRole('button', { name: 'Executive Office' })).not.toBeInTheDocument();
    expect(screen.queryByText('Agent console')).not.toBeInTheDocument();
  });

  it('does not render a hidden module when the tab is missing', () => {
    mockLoadSession.mockReturnValue(session({
      roles: ['CASHIER'],
      permissions: ['order:read'],
    }));
    render(<BackofficeShell />);
    expect(screen.queryByText('Staff module')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Staff' })).not.toBeInTheDocument();
  });

  it('hides the People group when no people tabs are permitted', () => {
    mockLoadSession.mockReturnValue(session({
      roles: ['KITCHEN_STAFF'],
      permissions: ['order:read', 'product:read'],
    }));
    render(<BackofficeShell />);
    expect(screen.queryByText('People')).not.toBeInTheDocument();
    expect(screen.getByText('Operations')).toBeInTheDocument();
  });

  it('does not treat a visible tab as an authorization grant', () => {
    mockLoadSession.mockReturnValue(session({
      roles: ['CASHIER'],
      permissions: ['order:read'],
    }));
    render(<BackofficeShell />);
    fireEvent.click(screen.getByRole('button', { name: 'Orders' }));
    expect(screen.getByText('Orders module')).toBeInTheDocument();
    expect(screen.queryByText('Staff module')).not.toBeInTheDocument();
  });

  it('switches navigation labels to Arabic and sets dir=rtl', () => {
    mockLoadSession.mockReturnValue(session({
      roles: ['RESTAURANT_OWNER'],
      permissions: ['order:read', 'product:read'],
    }));
    const { container } = render(<BackofficeShell />);
    fireEvent.click(screen.getByRole('button', { name: 'العربية' }));
    expect(container.firstChild).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('button', { name: 'الطلبات' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument();
  });

  it('keeps active-route highlighting on the selected tab', () => {
    mockLoadSession.mockReturnValue(session({
      roles: ['CASHIER'],
      permissions: ['order:read', 'product:read'],
    }));
    render(<BackofficeShell />);
    const orders = screen.getByRole('button', { name: 'Orders' });
    fireEvent.click(orders);
    expect(orders).toHaveAttribute('aria-current', 'page');
  });
});
