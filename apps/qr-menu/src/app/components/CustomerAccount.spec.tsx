import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CustomerAccount } from './CustomerAccount';

jest.mock('../lib/customer-api', () => {
  const actual = jest.requireActual('../lib/customer-api');
  return {
    ...actual,
    registerCustomer: jest.fn(),
    loginCustomer: jest.fn(),
    fetchCustomerProfile: jest.fn(),
    updateCustomerProfile: jest.fn(),
    fetchCustomerOrders: jest.fn(),
    customerLogout: jest.fn(),
  };
});

const api = jest.requireMock('../lib/customer-api') as {
  registerCustomer: jest.Mock;
  loginCustomer: jest.Mock;
  fetchCustomerProfile: jest.Mock;
  updateCustomerProfile: jest.Mock;
  fetchCustomerOrders: jest.Mock;
  customerLogout: jest.Mock;
};

const branding = { name: 'Albaik Demo', primaryColor: '#ff5733', currency: 'SAR' };

const profile = {
  id: 'customer-1', firstName: 'Sara', lastName: 'Ali', email: 'sara@example.com',
  phoneNumber: '+96891234567', loyaltyPoints: 0, createdAt: '2026-08-18T10:00:00.000Z',
};

describe('CustomerAccount (Phase 4 — mobile-first, restaurant-branded)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    api.fetchCustomerProfile.mockRejectedValue(new Error('no session'));
    api.fetchCustomerOrders.mockResolvedValue([]);
  });

  it('shows sign-in / create-account for signed-out visitors (guest path preserved)', () => {
    render(<CustomerAccount branding={branding} />);
    expect(screen.getAllByText('Sign in').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Create account')).toBeInTheDocument();
  });

  it('registers a new account', async () => {
    api.registerCustomer.mockResolvedValue({ token: 't', csrfToken: 'c', expiresIn: 1, customer: profile });
    render(<CustomerAccount branding={branding} />);
    fireEvent.click(screen.getAllByText('Create account')[0]);
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Sara' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Ali' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sara@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    await waitFor(() => {
      expect(api.registerCustomer).toHaveBeenCalledWith(expect.objectContaining({ email: 'sara@example.com', password: 'secret123' }));
    });
  });

  it('signs an existing customer in', async () => {
    api.loginCustomer.mockResolvedValue({ token: 't', csrfToken: 'c', expiresIn: 1, customer: profile });
    render(<CustomerAccount branding={branding} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sara@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    const form = document.querySelector('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);
    await waitFor(() => {
      expect(api.loginCustomer).toHaveBeenCalledWith({ email: 'sara@example.com', password: 'secret123' });
    });
    await waitFor(() => {
      expect(screen.getByText(/Welcome, Sara/)).toBeInTheDocument();
    });
  });

  it('shows the profile and own order history after sign-in', async () => {
    api.loginCustomer.mockResolvedValue({ token: 't', csrfToken: 'c', expiresIn: 1, customer: profile });
    api.fetchCustomerOrders.mockResolvedValue([
      {
        id: 'o1', orderNumber: 'ORD-2026-1', status: 'COMPLETED', type: 'DINE_IN',
        paymentMethod: 'CASH', total: 24, createdAt: '2026-08-18T10:00:00.000Z', itemCount: 2,
        items: [{ name: 'Chicken Tikka', quantity: 2 }],
      },
    ]);
    render(<CustomerAccount branding={branding} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sara@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    await waitFor(() => {
      expect(screen.getByText('#ORD-2026-1')).toBeInTheDocument();
    });
    expect(screen.getByText(/2 items/)).toBeInTheDocument();
  });

  it('toggles between English and Arabic (RTL)', () => {
    render(<CustomerAccount branding={branding} />);
    fireEvent.click(screen.getByText('العربية'));
    expect(screen.getByText('تسجيل الدخول')).toBeInTheDocument();
    const root = document.querySelector('[dir]');
    expect(root).toHaveAttribute('dir', 'rtl');
  });

  it('signs the customer out', async () => {
    api.loginCustomer.mockResolvedValue({ token: 't', csrfToken: 'c', expiresIn: 1, customer: profile });
    api.customerLogout.mockResolvedValue({ success: true });
    render(<CustomerAccount branding={branding} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sara@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText(/Welcome, Sara/)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Sign out'));
    await waitFor(() => {
      expect(screen.getAllByText('Sign in').length).toBeGreaterThanOrEqual(1);
    });
    expect(api.customerLogout).toHaveBeenCalled();
  });
});