import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginForm } from './LoginForm';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

const mockLoginStaff = jest.fn();
const mockSaveSession = jest.fn();

jest.mock('../lib/auth', () => ({
  loginStaff: (...args: unknown[]) => mockLoginStaff(...args),
  saveSession: (...args: unknown[]) => mockSaveSession(...args),
}));

const validSession = {
  accessToken: 'access-token-1',
  csrfToken: 'csrf-token-1',
  expiresIn: 900,
  tenantId: 'tenant-1',
  user: {
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'cashier@example.com',
    roles: ['CASHIER'],
    permissions: ['menu:read'],
    firstName: 'Cashier',
    lastName: 'One',
    mfaEnabled: false,
  },
};

beforeEach(() => {
  mockPush.mockReset();
  mockSaveSession.mockReset();
  mockLoginStaff.mockReset();
  window.history.replaceState({}, '', '/');
});

describe('LoginForm', () => {
  it('renders the email, password and submit controls', () => {
    render(<LoginForm />);
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });

  it('submits credentials and routes to the terminal on success', async () => {
    mockLoginStaff.mockResolvedValue({ ok: true, session: validSession });
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'cashier@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 's3cret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(mockLoginStaff).toHaveBeenCalledWith('cashier@example.com', 's3cret', undefined);
      expect(mockSaveSession).toHaveBeenCalledWith(validSession);
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('preserves a branchId query parameter when routing back', async () => {
    window.history.replaceState({}, '', '/?branchId=branch-42');
    mockLoginStaff.mockResolvedValue({ ok: true, session: validSession });
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'cashier@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 's3cret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/?branchId=branch-42');
    });
  });

  it('challenges for an authenticator code when MFA is required', async () => {
    mockLoginStaff.mockResolvedValueOnce({ ok: false, mfaRequired: true });
    mockLoginStaff.mockResolvedValueOnce({ ok: true, session: validSession });
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'cashier@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 's3cret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Authenticator code')).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('Authenticator code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify code' }));

    await waitFor(() => {
      expect(mockLoginStaff).toHaveBeenLastCalledWith('cashier@example.com', 's3cret', '123456');
      expect(mockSaveSession).toHaveBeenCalledWith(validSession);
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('shows the server error message on invalid credentials', async () => {
    mockLoginStaff.mockResolvedValue({ ok: false, error: 'Invalid credentials' });
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'cashier@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeTruthy();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('validates that email and password are present', async () => {
    const { container } = render(<LoginForm />);
    // fireEvent.submit bypasses HTML5 `required` constraint validation, letting
    // the component-level guard run (jsdom blocks the button-click path).
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    await waitFor(() => {
      expect(screen.getByText('Email and password are required.')).toBeTruthy();
    });
    expect(mockLoginStaff).not.toHaveBeenCalled();
  });
});
