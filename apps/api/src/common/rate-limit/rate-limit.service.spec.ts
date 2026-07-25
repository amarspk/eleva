import { Test, TestingModule } from '@nestjs/testing';
import { RateLimitService } from './rate-limit.service';
import { CacheService } from '../cache/cache.service';

describe('RateLimitService Unit Tests - DOC-006 5.6 Distributed Rate Limiting', () => {
  let service: RateLimitService;
  let _cacheService: CacheService;

  const mockCacheService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    isCacheActive: jest.fn().mockReturnValue(false),
    redisClient: null,
    isConnected: false,
  };

  beforeEach(async () => {
    // Reset mock cache to in-memory fallback state
    (mockCacheService as any).redisClient = null;
    (mockCacheService as any).isConnected = false;
    mockCacheService.isCacheActive = jest.fn().mockReturnValue(false) as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitService,
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<RateLimitService>(RateLimitService);
    _cacheService = module.get<CacheService>(CacheService);
    jest.clearAllMocks();
    // Ensure after clear, isCacheActive returns false for next tests
    mockCacheService.isCacheActive = jest.fn().mockReturnValue(false) as any;
    (mockCacheService as any).redisClient = null;
    (mockCacheService as any).isConnected = false;
  });

  it('should allow requests under limit', async () => {
    const key = '127.0.0.1';
    const config = { limit: 10, windowMs: 60000, keyPrefix: 'auth' };

    const result = await service.isRateLimited(key, config);

    expect(result.limited).toBe(false);
    expect(result.remaining).toBe(9);
  });

  it('should block requests over limit', async () => {
    const key = '192.168.1.1';
    const config = { limit: 2, windowMs: 60000, keyPrefix: 'test' };

    // First request
    let result = await service.isRateLimited(key, config);
    expect(result.limited).toBe(false);

    // Second request
    result = await service.isRateLimited(key, config);
    expect(result.limited).toBe(false);

    // Third request should be limited
    result = await service.isRateLimited(key, config);
    expect(result.limited).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it('should have correct tier configs per DOC-006 5.6', () => {
    const publicConfig = service.getTierConfig('public');
    expect(publicConfig.limit).toBe(120);
    expect(publicConfig.windowMs).toBe(60000);
    expect(publicConfig.keyPrefix).toBe('public');

    const checkoutConfig = service.getTierConfig('checkout');
    expect(checkoutConfig.limit).toBe(30);
    expect(checkoutConfig.keyPrefix).toBe('checkout');

    const authConfig = service.getTierConfig('auth');
    expect(authConfig.limit).toBe(10);
    expect(authConfig.keyPrefix).toBe('auth');
  });

  it('should reset after window expires (in-memory fallback)', async () => {
    const key = '10.0.0.1';
    const config = { limit: 1, windowMs: 100, keyPrefix: 'test-reset' };

    let result = await service.isRateLimited(key, config);
    expect(result.limited).toBe(false);

    // Immediate second should be limited
    result = await service.isRateLimited(key, config);
    expect(result.limited).toBe(true);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 150));

    result = await service.isRateLimited(key, config);
    expect(result.limited).toBe(false);
  });

  it('should use Redis when cache active', async () => {
    const mockRedisClient = {
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(true),
      ttl: jest.fn().mockResolvedValue(60),
    };

    (mockCacheService as any).redisClient = mockRedisClient;
    (mockCacheService as any).isConnected = true;
    jest.spyOn(mockCacheService, 'isCacheActive').mockReturnValue(true);

    const key = 'redis-test-ip';
    const config = { limit: 10, windowMs: 60000, keyPrefix: 'auth' };

    const result = await service.isRateLimited(key, config);

    expect(mockRedisClient.incr).toHaveBeenCalled();
    expect(result.limited).toBe(false);
    expect(result.remaining).toBe(9);
  });

  it('should isolate different IPs', async () => {
    const config = { limit: 1, windowMs: 60000, keyPrefix: 'test-isolation' };

    let result = await service.isRateLimited('1.1.1.1', config);
    expect(result.limited).toBe(false);

    result = await service.isRateLimited('1.1.1.1', config);
    expect(result.limited).toBe(true);

    // Different IP should not be limited
    result = await service.isRateLimited('2.2.2.2', config);
    expect(result.limited).toBe(false);
  });
});
