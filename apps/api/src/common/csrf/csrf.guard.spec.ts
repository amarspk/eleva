import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CsrfGuard } from './csrf.guard';
import { CsrfService } from './csrf.service';

describe('CsrfGuard (DOC-006 §5.3)', () => {
  let guard: CsrfGuard;
  let csrfService: jest.Mocked<CsrfService>;
  let reflector: Reflector;

  beforeEach(() => {
    csrfService = {
      generateToken: jest.fn(),
      validateToken: jest.fn(),
      deleteToken: jest.fn(),
    } as any;
    reflector = new Reflector();
    guard = new CsrfGuard(csrfService, reflector);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function createContext(method: string, headers: Record<string, string> = {}, user?: any): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          headers,
          url: '/api/v1/test',
          user,
        }),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as any;
  }

  describe('GET requests (non-mutating)', () => {
    it('should allow GET requests without CSRF token', async () => {
      const ctx = createContext('GET', {}, { id: 'user-1' });
      expect(await guard.canActivate(ctx)).toBe(true);
    });

    it('should allow HEAD requests without CSRF token', async () => {
      const ctx = createContext('HEAD', {}, { id: 'user-1' });
      expect(await guard.canActivate(ctx)).toBe(true);
    });

    it('should allow OPTIONS requests without CSRF token', async () => {
      const ctx = createContext('OPTIONS', {}, { id: 'user-1' });
      expect(await guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('POST requests (mutating)', () => {
    it('should reject POST without X-CSRF-Token header', async () => {
      const ctx = createContext('POST', {}, { id: 'user-1' });

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('should reject POST with invalid CSRF token', async () => {
      csrfService.validateToken.mockResolvedValueOnce(false);
      const ctx = createContext('POST', { 'x-csrf-token': 'invalid-token' }, { id: 'user-1' });

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('should allow POST with valid CSRF token', async () => {
      csrfService.validateToken.mockResolvedValueOnce(true);
      const ctx = createContext('POST', { 'x-csrf-token': 'valid-token' }, { id: 'user-1' });

      const result = await guard.canActivate(ctx);
      expect(result).toBe(true);
      expect(csrfService.validateToken).toHaveBeenCalledWith('user-1', 'valid-token');
    });
  });

  describe('PUT requests (mutating)', () => {
    it('should reject PUT without X-CSRF-Token header', async () => {
      const ctx = createContext('PUT', {}, { id: 'user-1' });

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('should allow PUT with valid CSRF token', async () => {
      csrfService.validateToken.mockResolvedValueOnce(true);
      const ctx = createContext('PUT', { 'x-csrf-token': 'valid-token' }, { id: 'user-1' });

      const result = await guard.canActivate(ctx);
      expect(result).toBe(true);
    });
  });

  describe('DELETE requests (mutating)', () => {
    it('should reject DELETE without X-CSRF-Token header', async () => {
      const ctx = createContext('DELETE', {}, { id: 'user-1' });

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('should allow DELETE with valid CSRF token', async () => {
      csrfService.validateToken.mockResolvedValueOnce(true);
      const ctx = createContext('DELETE', { 'x-csrf-token': 'valid-token' }, { id: 'user-1' });

      const result = await guard.canActivate(ctx);
      expect(result).toBe(true);
    });
  });

  describe('PATCH requests (mutating)', () => {
    it('should reject PATCH without X-CSRF-Token header', async () => {
      const ctx = createContext('PATCH', {}, { id: 'user-1' });

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('No user context', () => {
    it('should allow request when no user is present (lets JwtAuthGuard handle auth)', async () => {
      const ctx = createContext('POST', {}, undefined);
      expect(await guard.canActivate(ctx)).toBe(true);
    });
  });
});
