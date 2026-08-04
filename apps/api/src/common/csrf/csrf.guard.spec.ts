import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { CsrfGuard } from './csrf.guard';
import { CsrfService } from './csrf.service';
import { JWT_CONFIG } from '../../auth/config/jwt.config';

describe('CsrfGuard (DOC-006 §5.3)', () => {
  let guard: CsrfGuard;
  let csrfService: jest.Mocked<CsrfService>;
  let reflector: Reflector;
  let jwtService: JwtService;

  beforeEach(() => {
    csrfService = {
      generateToken: jest.fn(),
      validateToken: jest.fn(),
      deleteToken: jest.fn(),
    } as any;
    reflector = new Reflector();
    // DEFECT-I: the guard resolves identity from the bearer token itself
    // because, as a global APP_GUARD, it runs before JwtAuthGuard.
    jwtService = new JwtService({ secret: JWT_CONFIG.accessTokenSecret });
    guard = new CsrfGuard(csrfService, reflector, jwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * DEFECT-I regression helper: builds a context whose identity comes from a
   * REAL signed bearer token, exactly as production does — no hand-injected
   * `request.user`. The original suite only ever injected `user`, which is why
   * it passed while production skipped CSRF entirely.
   */
  function createBearerContext(
    method: string,
    headers: Record<string, string> = {},
    userId = 'user-1',
  ): ExecutionContext {
    const token = jwtService.sign({ sub: userId, email: 'u@e.com' }, { secret: JWT_CONFIG.accessTokenSecret });
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          headers: { ...headers, authorization: `Bearer ${token}` },
          url: '/api/v1/test',
          // deliberately NO `user` — this is the production shape
        }),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as any;
  }

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

  // ======================================================================
  // DEFECT-I regression (AUDIT-014)
  // ======================================================================
  // The guard is registered as a global APP_GUARD, so it runs BEFORE the
  // controller-level JwtAuthGuard and `request.user` is always undefined in
  // production. The original implementation bailed out on that condition,
  // which silently disabled CSRF on all 51 mutating routes. Runtime-proven:
  //
  //   PUT /api/v1/menu/products/:id
  //     Authorization: Bearer <valid>
  //     X-CSRF-Token: TOTALLY-BOGUS-VALUE-123     ->  HTTP 200
  //
  // Every test below uses a REAL signed bearer token and never injects
  // `request.user`, which is the exact shape production produces.
  describe('DEFECT-I — identity resolved from the bearer token (no request.user)', () => {
    it('rejects a mutating request that omits the CSRF header', async () => {
      const ctx = createBearerContext('POST', {});
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('rejects a FORGED CSRF token (the exact production bypass)', async () => {
      csrfService.validateToken.mockResolvedValue(false);
      const ctx = createBearerContext('PUT', { 'x-csrf-token': 'TOTALLY-BOGUS-VALUE-123' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('accepts a valid CSRF token and validates it against the token subject', async () => {
      csrfService.validateToken.mockResolvedValue(true);
      const ctx = createBearerContext('PUT', { 'x-csrf-token': 'valid-token' }, 'user-42');
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(csrfService.validateToken).toHaveBeenCalledWith('user-42', 'valid-token');
    });

    it('enforces CSRF on DELETE as well', async () => {
      csrfService.validateToken.mockResolvedValue(false);
      const ctx = createBearerContext('DELETE', { 'x-csrf-token': 'nope' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('still allows non-mutating GET with a bearer token and no CSRF header', async () => {
      const ctx = createBearerContext('GET', {});
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(csrfService.validateToken).not.toHaveBeenCalled();
    });

    it('falls through (no 403) when the bearer token is unverifiable, so JwtAuthGuard returns 401', async () => {
      const ctx = {
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'POST',
            headers: { authorization: 'Bearer not.a.valid.jwt' },
            url: '/api/v1/test',
          }),
        }),
        getHandler: () => jest.fn(),
        getClass: () => jest.fn(),
      } as any;
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(csrfService.validateToken).not.toHaveBeenCalled();
    });

    it('does not accept a token signed with the WRONG secret', async () => {
      const foreign = new JwtService({ secret: 'an-attacker-controlled-secret' });
      const token = foreign.sign({ sub: 'user-1' }, { secret: 'an-attacker-controlled-secret' });
      const ctx = {
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'POST',
            headers: { authorization: `Bearer ${token}` },
            url: '/api/v1/test',
          }),
        }),
        getHandler: () => jest.fn(),
        getClass: () => jest.fn(),
      } as any;
      // Unverifiable -> falls through to JwtAuthGuard (401), never validated as a session.
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(csrfService.validateToken).not.toHaveBeenCalled();
    });
  });
});
