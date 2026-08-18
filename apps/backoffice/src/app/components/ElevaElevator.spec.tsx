import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ElevaElevator } from './ElevaElevator';

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
    email: 'owner@example.com',
    roles: ['RESTAURANT_OWNER'],
    permissions: ['*'],
    firstName: 'Owner',
  },
};

describe('ElevaElevator (ELEVA Tower — authentication elevator)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  it('asks for credentials only — never asks the user to choose a role', () => {
    render(<ElevaElevator />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Tenant ID')).toBeInTheDocument();
    // No role selector of any kind
    expect(screen.queryByText(/cashier/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/role/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/manager/i)).not.toBeInTheDocument();
  });

  it('submits credentials and lets the server determine the destination', async () => {
    mockLoginStaff.mockResolvedValue({ ok: true, session: validSession });
    render(<ElevaElevator />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Demo1234!' } });
    fireEvent.change(screen.getByLabelText('Tenant ID'), { target: { value: 'tenant-1' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Sign in/ }));
    });

    await waitFor(() => {
      expect(mockLoginStaff).toHaveBeenCalledWith('owner@example.com', 'Demo1234!', undefined);
      expect(mockSaveSession).toHaveBeenCalledWith(validSession);
    });
  });

  it('handles MFA challenge (401 "MFA token required")', async () => {
    mockLoginStaff
      .mockResolvedValueOnce({ ok: false, mfaRequired: true })
      .mockResolvedValueOnce({ ok: true, session: validSession });

    render(<ElevaElevator />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Demo1234!' } });
    fireEvent.change(screen.getByLabelText('Tenant ID'), { target: { value: 'tenant-1' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Sign in/ }));
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Authenticator code')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Authenticator code'), { target: { value: '123456' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Verify code' }));
    });

    await waitFor(() => {
      expect(mockLoginStaff).toHaveBeenLastCalledWith('owner@example.com', 'Demo1234!', '123456');
    });
  });

  it('shows an error when credentials are rejected', async () => {
    mockLoginStaff.mockResolvedValue({ ok: false, error: 'Invalid credentials' });
    render(<ElevaElevator />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'bad@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.change(screen.getByLabelText('Tenant ID'), { target: { value: 'tenant-1' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Sign in/ }));
    });

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
    expect(mockSaveSession).not.toHaveBeenCalled();
  });

  it('requires all three fields before submitting', async () => {
    render(<ElevaElevator />);
    const form = document.querySelector('form');
    expect(form).not.toBeNull();
    await act(async () => {
      fireEvent.submit(form as HTMLFormElement);
    });
    expect(mockLoginStaff).not.toHaveBeenCalled();
    expect(screen.getByText(/Email, password, and Tenant ID are required/)).toBeInTheDocument();
  });
});