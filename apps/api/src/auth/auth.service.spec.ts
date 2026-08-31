import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService, AuthServiceDependencies } from './auth.service';
import { CacheService } from '../common/cache/cache.service';
import { EmailService } from '../notification/email/email.service';
import { ServiceUnavailableException } from '@nestjs/common';

// Mocking argon2 C++ native modules to prevent Jest V8 multithreaded segmentation faults
jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock-hashed-password'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

describe('AuthService Unit Tests', () => {
  let service: AuthService;

  const mockJwtService = {
    signAsync: jest.fn().mockResolvedValue('mock-token'),
    verifyAsync: jest.fn(),
  };

  const mockCacheService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    // Durable write used by revokeAllUserTokens (security control, fail-closed).
    setStrict: jest.fn().mockResolvedValue(true),
  };

  const mockEmailService = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue({ success: true, mocked: true }),
  };

  const mockAuthServiceDependencies = {
    prisma: {
      user: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    },
    dbTenantContext: {
      run: jest.fn(async (_ctx: unknown, fn: () => Promise<unknown>) => fn()),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: CacheService, useValue: mockCacheService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: AuthServiceDependencies, useValue: mockAuthServiceDependencies },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should successfully hash and verify passwords using mock wrapper', async () => {
    const password = 'SuperSecurePassword123!';
    const hash = await service.hashPassword(password);

    expect(hash).toBe('mock-hashed-password');

    const isValid = await service.comparePassword(password, hash);
    expect(isValid).toBe(true);
  });

  it('should generate JWT tokens successfully', async () => {
    const payload = {
      sub: 'u1',
      email: 'user@zayjar.com',
      tenantId: 't1',
      roles: ['CASHIER'],
      permissions: ['orders:create'],
    };

    const tokens = await service.generateTokens(payload);
    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();
  });

  describe('initiatePasswordReset', () => {
    it('issues a reset token and sends email when the email exists', async () => {
      mockCacheService.set.mockResolvedValue(undefined);
      mockEmailService.sendPasswordResetEmail.mockResolvedValue({ success: true });
      mockAuthServiceDependencies.prisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        firstName: 'Owner',
        email: 'Owner@example.com',
      });

      const result = await service.initiatePasswordReset('Owner@example.com');
      expect(result.sent).toBe(true);
      expect(mockCacheService.set).toHaveBeenCalledTimes(1);
      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    });

    it('still returns sent=true without emailing when the email does not exist', async () => {
      mockCacheService.set.mockResolvedValue(undefined);
      mockEmailService.sendPasswordResetEmail.mockClear();
      mockAuthServiceDependencies.prisma.user.findFirst.mockResolvedValue(null);

      const result = await service.initiatePasswordReset('unknown@example.com');
      expect(result.sent).toBe(true);
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('updates password and revokes tokens for a valid reset token', async () => {
      mockCacheService.get.mockResolvedValue({ userId: 'u1', email: 'user@example.com', token: 't1' });
      mockCacheService.setStrict.mockResolvedValue(true);

      const result = await service.resetPassword('t1', 'NewStrongPass123!');
      expect(result.success).toBe(true);
    });

    it('rejects an invalid or expired reset token', async () => {
      mockCacheService.get.mockResolvedValue(null);

      await expect(service.resetPassword('bad-token', 'NewStrongPass123!')).rejects.toThrow(
        'Invalid or expired password reset token.',
      );
    });
  });

  // ==========================================
  // Production-readiness review — token revocation must fail CLOSED
  // ==========================================
  describe('revokeAllUserTokens', () => {
    it('persists a revocation cut-off via the durable write path', async () => {
      mockCacheService.setStrict.mockResolvedValue(true);

      await service.revokeAllUserTokens('user-123');

      expect(mockCacheService.setStrict).toHaveBeenCalledWith(
        'revoked:user:user-123',
        expect.any(Number),
        expect.any(Number),
      );
    });

    it('throws when the session store cannot persist the marker (no silent fail-open)', async () => {
      // `cacheService.set` is best-effort and returns silently when Redis is
      // offline; using it here reported a successful revocation while storing
      // nothing, leaving a deleted user's JWT valid until expiry.
      mockCacheService.setStrict.mockResolvedValue(false);

      await expect(service.revokeAllUserTokens('user-123')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('is a no-op for an empty user id', async () => {
      mockCacheService.setStrict.mockClear();

      await service.revokeAllUserTokens('');

      expect(mockCacheService.setStrict).not.toHaveBeenCalled();
    });
  });
});
