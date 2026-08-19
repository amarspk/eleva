import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CacheService } from '../common/cache/cache.service';
import { EmailService } from '../notification/email/email.service';
import { prisma } from '@zayjar/db';

// Mocking argon2 C++ native modules to prevent Jest V8 multithreaded segmentation faults
jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock-hashed-password'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

// AUDIT-005 flows run inside dbTenantContext (fail-safe tenant extension).
// The mock executes the callback directly, mirroring AsyncLocalStorage.run.
jest.mock('@zayjar/db', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    tenant: {
      findUnique: jest.fn(),
    },
  },
  dbTenantContext: {
    run: (_store: unknown, callback: () => unknown) => callback(),
  },
}));

const HEX64 = /^[0-9a-f]{64}$/;

describe('AuthService (AUDIT-005 — password reset + email verification)', () => {
  let service: AuthService;
  const mockCacheService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    // Durable write used by revokeAllUserTokens (security control, fail-closed).
    setStrict: jest.fn().mockResolvedValue(true),
  };
  const mockEmailService = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue({ success: true }),
    sendEmailVerificationEmail: jest.fn().mockResolvedValue({ success: true }),
  };

  const userFindFirst = prisma.user.findFirst as jest.Mock;
  const userUpdate = prisma.user.update as jest.Mock;
  const tenantFindUnique = prisma.tenant.findUnique as jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Deterministic token/expiry surface. RESET_URL_BASE is set so the URL is
    // built without a tenant lookup; a dedicated test clears it to exercise
    // the subdomain fallback.
    process.env.RESET_URL_BASE = 'https://app.zayjar.com';
    userFindFirst.mockReset();
    userUpdate.mockReset();
    tenantFindUnique.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: { signAsync: jest.fn(), verifyAsync: jest.fn() } },
        { provide: CacheService, useValue: mockCacheService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    delete process.env.RESET_URL_BASE;
    delete process.env.REQUIRE_EMAIL_VERIFIED;
  });

  // ==========================================
  // requestPasswordReset — enumeration resistance + dispatch
  // ==========================================

  it('returns the SAME generic response for a known and an unknown email (no enumeration)', async () => {
    userFindFirst.mockResolvedValueOnce({ id: 'u1', firstName: 'John', tenantId: 't1' });
    userUpdate.mockResolvedValue({});
    const known = await service.requestPasswordReset('Owner@Gourmet.com');

    userFindFirst.mockResolvedValueOnce(null);
    const unknown = await service.requestPasswordReset('nobody@nowhere.com');

    expect(known).toEqual(unknown);
    expect(known).toEqual({
      message: 'If an account exists for that email, a password reset link has been sent.',
    });
    // Only the KNOWN email produced a token write; the unknown email caused
    // no additional write and no email dispatch.
    expect(userUpdate).toHaveBeenCalledTimes(1);
    expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  it('generates a secure token, stores ONLY its SHA-256 hash + expiry, and emails the raw token in the link', async () => {
    userFindFirst.mockResolvedValue({ id: 'u1', firstName: 'John', tenantId: 't1' });
    userUpdate.mockResolvedValue({});

    await service.requestPasswordReset('owner@gourmet.com');

    // Token write: 64-char hex hash + expiry ~1h in the future.
    const updateArgs = userUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(updateArgs.data.resetTokenHash).toMatch(HEX64);
    const expiry = updateArgs.data.resetTokenExpiry as Date;
    expect(expiry.getTime()).toBeGreaterThan(Date.now() + 55 * 60 * 1000);
    expect(expiry.getTime()).toBeLessThanOrEqual(Date.now() + 61 * 60 * 1000);

    // The email receives the RAW token inside the reset URL, proving the raw
    // token is not what is stored (hash !== raw).
    const [to, vars] = mockEmailService.sendPasswordResetEmail.mock.calls[0] as [
      string,
      { firstName: string; email: string; resetUrl: string },
    ];
    expect(to).toBe('owner@gourmet.com');
    expect(vars.firstName).toBe('John');
    const rawToken = new URL(vars.resetUrl).searchParams.get('token') as string;
    expect(rawToken).toMatch(HEX64);
    expect(rawToken).not.toBe(updateArgs.data.resetTokenHash);
  });

  it('never reveals account existence when the email is unknown and sends no email', async () => {
    userFindFirst.mockResolvedValue(null);

    const result = await service.requestPasswordReset('ghost@nowhere.com');

    expect(result.message).toContain('If an account exists');
    expect(userUpdate).not.toHaveBeenCalled();
    expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('builds the reset URL from the verified tenant subdomain when RESET_URL_BASE is unset', async () => {
    delete process.env.RESET_URL_BASE;
    userFindFirst.mockResolvedValue({ id: 'u1', firstName: 'John', tenantId: 't1' });
    tenantFindUnique.mockResolvedValue({ subdomain: 'gourmet' });
    userUpdate.mockResolvedValue({});

    await service.requestPasswordReset('owner@gourmet.com');

    expect(tenantFindUnique).toHaveBeenCalledWith({ where: { id: 't1' }, select: { subdomain: true } });
    const [, vars] = mockEmailService.sendPasswordResetEmail.mock.calls[0] as [
      string,
      { resetUrl: string },
    ];
    expect(new URL(vars.resetUrl).origin).toBe('https://gourmet.zayjar.com');
    expect(new URL(vars.resetUrl).pathname).toBe('/reset-password');
  });

  it('still returns the generic response when no URL can be built (email skipped, nothing leaked)', async () => {
    delete process.env.RESET_URL_BASE;
    userFindFirst.mockResolvedValue({ id: 'u1', firstName: 'John', tenantId: null });
    userUpdate.mockResolvedValue({});

    const result = await service.requestPasswordReset('owner@gourmet.com');

    expect(result.message).toContain('If an account exists');
    expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  // ==========================================
  // resetPassword — one-time, expiring, revoking
  // ==========================================

  it('rejects an invalid token (400) and performs no writes', async () => {
    userFindFirst.mockResolvedValue(null);

    await expect(service.resetPassword('deadbeef', 'NewPassword123!')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('rejects an expired token (400) and performs no writes', async () => {
    userFindFirst.mockResolvedValue({
      id: 'u1',
      resetTokenExpiry: new Date(Date.now() - 60_000),
    });

    await expect(service.resetPassword('expiredtoken', 'NewPassword123!')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('rejects a used token — the cleared hash no longer matches (400)', async () => {
    // After a previous successful reset the hash column is null, so the
    // lookup itself fails — the "used" state is indistinguishable from invalid.
    userFindFirst.mockResolvedValue(null);

    await expect(service.resetPassword('usedtoken', 'NewPassword123!')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('rehashes the new password (Argon2id), clears the token fields, revokes ALL sessions', async () => {
    userFindFirst.mockResolvedValue({
      id: 'u1',
      resetTokenExpiry: new Date(Date.now() + 30 * 60 * 1000),
    });
    userUpdate.mockResolvedValue({});
    const revokeSpy = jest.spyOn(service, 'revokeAllUserTokens').mockResolvedValue(undefined);

    const result = await service.resetPassword('validrawtoken', 'NewPassword123!');

    expect(result.message).toContain('has been reset');
    const updateArgs = userUpdate.mock.calls[0][0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(updateArgs.where.id).toBe('u1');
    expect(updateArgs.data.passwordHash).toBe('mock-hashed-password');
    expect(updateArgs.data.resetTokenHash).toBeNull();
    expect(updateArgs.data.resetTokenExpiry).toBeNull();
    expect(revokeSpy).toHaveBeenCalledWith('u1');
    revokeSpy.mockRestore();
  });

  // ==========================================
  // verifyEmail — one-time, expiring
  // ==========================================

  it('verifies a valid token: sets emailVerified true and clears the token fields', async () => {
    userFindFirst.mockResolvedValue({
      id: 'u1',
      emailVerificationTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
    });
    userUpdate.mockResolvedValue({});

    const result = await service.verifyEmail('validverifytoken');

    expect(result.message).toContain('verified');
    const updateArgs = userUpdate.mock.calls[0][0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(updateArgs.data.emailVerified).toBe(true);
    expect(updateArgs.data.emailVerificationTokenHash).toBeNull();
    expect(updateArgs.data.emailVerificationTokenExpiry).toBeNull();
  });

  it('rejects an invalid verification token (400) with no writes', async () => {
    userFindFirst.mockResolvedValue(null);

    await expect(service.verifyEmail('badtoken')).rejects.toBeInstanceOf(BadRequestException);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('rejects an expired verification token (400) with no writes', async () => {
    userFindFirst.mockResolvedValue({
      id: 'u1',
      emailVerificationTokenExpiry: new Date(Date.now() - 60_000),
    });

    await expect(service.verifyEmail('expiredverify')).rejects.toBeInstanceOf(BadRequestException);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('rejects a used verification token — cleared hash no longer matches (400)', async () => {
    userFindFirst.mockResolvedValue(null);

    await expect(service.verifyEmail('usedverify')).rejects.toBeInstanceOf(BadRequestException);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  // ==========================================
  // createEmailVerification / sendVerificationEmail helpers
  // ==========================================

  it('createEmailVerification returns a secure raw token, its SHA-256 hash and a ~24h expiry', () => {
    const created = service.createEmailVerification();

    expect(created.rawToken).toMatch(HEX64);
    expect(created.tokenHash).toMatch(HEX64);
    expect(created.tokenHash).not.toBe(created.rawToken);
    const ttl = created.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
  });

  it('sendVerificationEmail dispatches the raw token inside the verify URL only', async () => {
    process.env.RESET_URL_BASE = 'https://app.zayjar.com';

    await service.sendVerificationEmail('sara@albaik.com', 'Sara', 'rawtoken123', 't1');

    expect(mockEmailService.sendEmailVerificationEmail).toHaveBeenCalledWith(
      'sara@albaik.com',
      { firstName: 'Sara', verifyUrl: 'https://app.zayjar.com/verify-email?token=rawtoken123' },
    );
  });

  it('sendVerificationEmail never throws — dispatch failures are logged and swallowed (fire-and-forget)', async () => {
    mockEmailService.sendEmailVerificationEmail.mockRejectedValueOnce(new Error('SMTP down'));

    await expect(
      service.sendVerificationEmail('sara@albaik.com', 'Sara', 'rawtoken123', 't1'),
    ).resolves.toBeUndefined();
  });

  // ==========================================
  // Login gate — REQUIRE_EMAIL_VERIFIED / production
  // ==========================================

  const loginUser = {
    id: 'u-login',
    email: 'owner@gourmet.com',
    tenantId: 't1',
    firstName: 'John',
    lastName: 'Owner',
    passwordHash: 'mock-hash',
    isActive: true,
    mfaEnabled: false,
    mfaSecret: null,
    emailVerified: false,
    userRoles: [{ role: { name: 'RESTAURANT_OWNER', rolePermissions: [] } }],
    userBranches: [],
  };

  it('rejects login when email is unverified and REQUIRE_EMAIL_VERIFIED=true', async () => {
    process.env.REQUIRE_EMAIL_VERIFIED = 'true';
    userFindFirst.mockResolvedValue(loginUser);

    await expect(service.validateLogin('owner@gourmet.com', 'Demo1234!', undefined, 't1')).rejects.toMatchObject({
      message: 'Email verification required',
    });
  });

  it('allows login when email is verified and the gate is on', async () => {
    process.env.REQUIRE_EMAIL_VERIFIED = 'true';
    userFindFirst.mockResolvedValue({ ...loginUser, emailVerified: true });

    const profile = await service.validateLogin('owner@gourmet.com', 'Demo1234!', undefined, 't1');
    expect(profile.id).toBe('u-login');
    delete process.env.REQUIRE_EMAIL_VERIFIED;
  });

  it('does not reject unverified email when the gate is off (dev/test default)', async () => {
    delete process.env.REQUIRE_EMAIL_VERIFIED;
    userFindFirst.mockResolvedValue(loginUser);

    const profile = await service.validateLogin('owner@gourmet.com', 'Demo1234!', undefined, 't1');
    expect(profile.id).toBe('u-login');
  });

  it('treats production NODE_ENV as fail-closed unless REQUIRE_EMAIL_VERIFIED=false', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    delete process.env.REQUIRE_EMAIL_VERIFIED;
    expect(service.isEmailVerificationRequired()).toBe(true);
    process.env.REQUIRE_EMAIL_VERIFIED = 'false';
    expect(service.isEmailVerificationRequired()).toBe(false);
    delete process.env.REQUIRE_EMAIL_VERIFIED;
    process.env.NODE_ENV = previous;
  });
});
