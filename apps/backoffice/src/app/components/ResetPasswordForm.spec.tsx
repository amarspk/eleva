import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ResetPasswordForm } from './ResetPasswordForm';

const mockReset = jest.fn();
let search = '';

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

jest.mock('../lib/account-recovery', () => ({
  resetStaffPassword: (...args: unknown[]) => mockReset(...args),
}));

describe('ResetPasswordForm', () => {
  beforeEach(() => {
    mockReset.mockReset();
    search = 'token=abc123';
  });

  it('shows missing-token state without calling the API', () => {
    search = '';
    render(<ResetPasswordForm />);
    expect(screen.getByRole('alert')).toHaveTextContent('missing a token');
    expect(mockReset).not.toHaveBeenCalled();
  });

  it('rejects a confirmation mismatch without calling the API', async () => {
    render(<ResetPasswordForm />);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'NewPassword123!' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'OtherPassword123!' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Update password' }).closest('form') as HTMLFormElement);
    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(mockReset).not.toHaveBeenCalled();
  });

  it('rejects a short password without calling the API', async () => {
    render(<ResetPasswordForm />);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'short' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Update password' }).closest('form') as HTMLFormElement);
    expect(await screen.findByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(mockReset).not.toHaveBeenCalled();
  });

  it('submits a valid token and shows the success state', async () => {
    mockReset.mockResolvedValue({ ok: true, message: 'Your password has been reset. Please sign in with your new password.' });
    render(<ResetPasswordForm />);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'NewPassword123!' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'NewPassword123!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    await waitFor(() => {
      expect(mockReset).toHaveBeenCalledWith('abc123', 'NewPassword123!');
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Your password has been reset');
    expect(screen.getByText('Sign in')).toHaveAttribute('href', '/login');
  });

  it('shows the invalid/expired server message', async () => {
    mockReset.mockResolvedValue({ ok: false, error: 'The reset link is invalid or has expired.' });
    render(<ResetPasswordForm />);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'NewPassword123!' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'NewPassword123!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByText('The reset link is invalid or has expired.')).toBeInTheDocument();
  });
});
