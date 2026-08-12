import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { validate } from 'class-validator';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CsrfService } from '../common/csrf/csrf.service';
import { RateLimitGuard } from '../common/rate-limit/rate-limit.guard';
import { RATE_LIMIT_KEY } from '../common/rate-limit/rate-limit.guard';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { ForgotPasswordRequestDto } from './dto/forgot-password-request.dto';
import { ResetPasswordRequestDto } from './dto/reset-password-request.dto';
import { VerifyEmailRequestDto } from './dto/verify-email-request.dto';

// AUDIT-005 — the three new public auth endpoints must carry the same
// protections as login: @Public(), RateLimitGuard + auth tier, and they must
// only delegate to AuthService (no logic in the controller).

describe('AuthController (AUDIT-005 — forgot/reset/verify routes)', () => {
  let controller: AuthController;
  const authServiceMock = {
    requestPasswordReset: jest.fn().mockResolvedValue({
      message: 'If an account exists for that email, a password reset link has been sent.',
    }),
    resetPassword: jest.fn().mockResolvedValue({ message: 'Your password has been reset.' }),
    verifyEmail: jest.fn().mockResolvedValue({ message: 'Your email has been verified.' }),
  };
  const reflector = new Reflector();

  beforeEach(() => {
    jest.clearAllMocks();
    // The three AUDIT-005 routes are @Public() and never touch CSRF — a stub
    // satisfies the constructor signature (same shape as the login flows).
    controller = new AuthController(
      authServiceMock as unknown as AuthService,
      {} as unknown as CsrfService,
    );
  });

  it('delegates forgot-password to AuthService and returns the generic response', async () => {
    const result = await controller.forgotPassword({ email: 'owner@gourmet.com' });

    expect(authServiceMock.requestPasswordReset).toHaveBeenCalledWith('owner@gourmet.com');
    expect(result.message).toContain('If an account exists');
  });

  it('delegates reset-password to AuthService with token + password', async () => {
    const result = await controller.resetPassword({ token: 'rawtoken', password: 'NewPassword123!' });

    expect(authServiceMock.resetPassword).toHaveBeenCalledWith('rawtoken', 'NewPassword123!');
    expect(result.message).toContain('has been reset');
  });

  it('delegates verify-email to AuthService with the token', async () => {
    const result = await controller.verifyEmail({ token: 'rawverify' });

    expect(authServiceMock.verifyEmail).toHaveBeenCalledWith('rawverify');
    expect(result.message).toContain('verified');
  });

  it('marks all three routes @Public() like login', () => {
    for (const method of ['forgotPassword', 'resetPassword', 'verifyEmail'] as const) {
      expect(reflector.get(IS_PUBLIC_KEY, controller[method])).toBe(true);
    }
  });

  it('applies RateLimitGuard with the auth tier to all three routes', () => {
    for (const method of ['forgotPassword', 'resetPassword', 'verifyEmail'] as const) {
      const guards = reflector.get<unknown[]>('__guards__', controller[method]) ?? [];
      expect(guards.some((g) => (g as unknown) === (RateLimitGuard as unknown))).toBe(true);
      const meta = reflector.get<{ tier: string }>(RATE_LIMIT_KEY, controller[method]);
      expect(meta?.tier).toBe('auth');
    }
  });

  // ==========================================
  // DTO validation (class-validator, same conventions as create-user)
  // ==========================================

  it('forgot-password DTO rejects a malformed email', async () => {
    const errors = await validate(Object.assign(new ForgotPasswordRequestDto(), { email: 'not-an-email' }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('forgot-password DTO accepts a valid email', async () => {
    const errors = await validate(Object.assign(new ForgotPasswordRequestDto(), { email: 'owner@gourmet.com' }));
    expect(errors).toEqual([]);
  });

  it('reset-password DTO rejects a weak (<8 chars) password', async () => {
    const errors = await validate(
      Object.assign(new ResetPasswordRequestDto(), { token: 't', password: 'short' }),
    );
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('reset-password DTO rejects a missing/empty token', async () => {
    const errors = await validate(
      Object.assign(new ResetPasswordRequestDto(), { token: '', password: 'ValidPass123!' }),
    );
    expect(errors.some((e) => e.property === 'token')).toBe(true);
  });

  it('reset-password DTO accepts a valid token + password', async () => {
    const errors = await validate(
      Object.assign(new ResetPasswordRequestDto(), { token: 't', password: 'ValidPass123!' }),
    );
    expect(errors).toEqual([]);
  });

  it('verify-email DTO rejects a missing/empty token and accepts a valid one', async () => {
    const empty = await validate(Object.assign(new VerifyEmailRequestDto(), { token: '' }));
    expect(empty.some((e) => e.property === 'token')).toBe(true);

    const ok = await validate(Object.assign(new VerifyEmailRequestDto(), { token: 'rawverify' }));
    expect(ok).toEqual([]);
  });

  it('rejects an invalid reset password with a 400-class error (integration of DTO + service contract)', async () => {
    // The service itself raises BadRequestException for invalid/expired/used
    // tokens — the controller surfaces it unchanged (Nest maps to 400).
    authServiceMock.resetPassword.mockRejectedValueOnce(
      new BadRequestException('The reset link is invalid or has expired.'),
    );
    await expect(
      controller.resetPassword({ token: 'bad', password: 'ValidPass123!' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
