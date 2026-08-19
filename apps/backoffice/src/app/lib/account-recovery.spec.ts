import { resetStaffPassword, verifyStaffEmail } from './account-recovery';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('account-recovery client', () => {
  const fetchImpl = jest.fn();

  beforeEach(() => {
    fetchImpl.mockReset();
  });

  it('POSTs reset-password with token and password only', async () => {
    fetchImpl.mockResolvedValue(jsonResponse({ message: 'Your password has been reset. Please sign in with your new password.' }));
    const result = await resetStaffPassword('raw-token', 'NewPassword123!', fetchImpl);
    expect(result).toEqual({
      ok: true,
      message: 'Your password has been reset. Please sign in with your new password.',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/v1/auth/reset-password',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'raw-token', password: 'NewPassword123!' }),
      }),
    );
    expect(String(fetchImpl.mock.calls[0][1].body)).not.toContain('localStorage');
  });

  it('maps invalid/expired reset failures without inventing account existence', async () => {
    fetchImpl.mockResolvedValue(jsonResponse({ message: 'The reset link is invalid or has expired.' }, 400));
    const result = await resetStaffPassword('bad', 'NewPassword123!', fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('The reset link is invalid or has expired.');
    }
  });

  it('POSTs verify-email with the token only', async () => {
    fetchImpl.mockResolvedValue(jsonResponse({ message: 'Your email has been verified.' }));
    const result = await verifyStaffEmail('verify-token', fetchImpl);
    expect(result).toEqual({ ok: true, message: 'Your email has been verified.' });
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/v1/auth/verify-email',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'verify-token' }),
      }),
    );
  });
});
