import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { VerifyEmailForm } from './VerifyEmailForm';

const mockVerify = jest.fn();
let search = '';

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

jest.mock('../lib/account-recovery', () => ({
  verifyStaffEmail: (...args: unknown[]) => mockVerify(...args),
}));

describe('VerifyEmailForm', () => {
  beforeEach(() => {
    mockVerify.mockReset();
    search = 'token=verify-1';
  });

  it('shows missing-token state without calling the API', () => {
    search = '';
    render(<VerifyEmailForm />);
    expect(screen.getByRole('alert')).toHaveTextContent('missing a token');
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('shows a loading state then success', async () => {
    mockVerify.mockResolvedValue({ ok: true, message: 'Your email has been verified.' });
    render(<VerifyEmailForm />);
    expect(screen.getByRole('status')).toHaveTextContent('Verifying your email');
    await waitFor(() => {
      expect(mockVerify).toHaveBeenCalledWith('verify-1');
    });
    expect(await screen.findByText('Your email has been verified.')).toBeInTheDocument();
    expect(screen.getByText('Sign in')).toHaveAttribute('href', '/login');
  });

  it('shows invalid/expired token errors from the server', async () => {
    mockVerify.mockResolvedValue({ ok: false, error: 'The verification link is invalid or has expired.' });
    render(<VerifyEmailForm />);
    expect(await screen.findByText('The verification link is invalid or has expired.')).toBeInTheDocument();
  });
});
