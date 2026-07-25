import { Test, TestingModule } from '@nestjs/testing';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitService } from './rate-limit.service';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, HttpStatus } from '@nestjs/common';

describe('RateLimitGuard Unit Tests - DOC-006 5.6', () => {
  let guard: RateLimitGuard;
  let _rateLimitService: RateLimitService;
  let _reflector: Reflector;

  const mockRateLimitService = {
    isRateLimited: jest.fn(),
    getTierConfig: jest.fn().mockReturnValue({ limit: 10, windowMs: 60000, keyPrefix: 'auth' }),
  };

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitGuard,
        { provide: RateLimitService, useValue: mockRateLimitService },
        { provide: Reflector, useValue: mockReflector },
      ],
    }).compile();

    guard = module.get<RateLimitGuard>(RateLimitGuard);
    _rateLimitService = module.get<RateLimitService>(RateLimitService);
    _reflector = module.get<Reflector>(Reflector);
    jest.clearAllMocks();
  });

  const createMockContext = (ip: string, userId?: string, headers?: any): ExecutionContext => {
    const mockRequest = {
      ip,
      headers: headers || {},
      user: userId ? { id: userId, sub: userId } : undefined,
      connection: { remoteAddress: ip },
    };
    const mockResponse = {
      setHeader: jest.fn(),
    };
    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;
  };

  it('should allow when no rate limit metadata', async () => {
    jest.spyOn(mockReflector, 'getAllAndOverride').mockReturnValue(undefined);

    const context = createMockContext('127.0.0.1');
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockRateLimitService.isRateLimited).not.toHaveBeenCalled();
  });

  it('should allow request under limit and set headers', async () => {
    jest.spyOn(mockReflector, 'getAllAndOverride').mockReturnValue({ tier: 'auth' });
    jest.spyOn(mockRateLimitService, 'isRateLimited').mockResolvedValue({
      limited: false,
      remaining: 9,
      resetTime: Date.now() + 60000,
    });

    const context = createMockContext('192.168.1.1');
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockRateLimitService.isRateLimited).toHaveBeenCalled();

    const response = context.switchToHttp().getResponse();
    expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', expect.any(Number));
    expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 9);
  });

  it('should block request over limit with 429 and set Retry-After', async () => {
    jest.spyOn(mockReflector, 'getAllAndOverride').mockReturnValue({ tier: 'auth' });
    jest.spyOn(mockRateLimitService, 'isRateLimited').mockResolvedValue({
      limited: true,
      remaining: 0,
      resetTime: Date.now() + 30000,
    });

    const context = createMockContext('10.0.0.1');

    await expect(guard.canActivate(context)).rejects.toThrow(expect.objectContaining({ status: HttpStatus.TOO_MANY_REQUESTS }));

    const response = context.switchToHttp().getResponse();
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(Number));
  });

  it('should generate key from IP and userId for tenant isolation', async () => {
    jest.spyOn(mockReflector, 'getAllAndOverride').mockReturnValue({ tier: 'checkout' });
    jest.spyOn(mockRateLimitService, 'isRateLimited').mockResolvedValue({
      limited: false,
      remaining: 29,
      resetTime: Date.now() + 60000,
    });

    const context = createMockContext('1.2.3.4', 'user-123');
    await guard.canActivate(context);

    expect(mockRateLimitService.isRateLimited).toHaveBeenCalledWith('1.2.3.4:user-123', expect.any(Object));
  });

  it('should respect custom limit and window', async () => {
    jest.spyOn(mockReflector, 'getAllAndOverride').mockReturnValue({ tier: 'public', customLimit: 5, customWindowMs: 30000 });
    jest.spyOn(mockRateLimitService, 'isRateLimited').mockResolvedValue({
      limited: false,
      remaining: 4,
      resetTime: Date.now() + 30000,
    });

    const context = createMockContext('5.5.5.5');
    await guard.canActivate(context);

    expect(mockRateLimitService.isRateLimited).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ limit: 5, windowMs: 30000 }),
    );
  });
});
