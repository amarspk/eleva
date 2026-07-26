import { CsrfService } from './csrf.service';
import { CacheService } from '../cache/cache.service';

jest.mock('../cache/cache.service');

describe('CsrfService (DOC-006 §5.3)', () => {
  let service: CsrfService;
  let cacheService: jest.Mocked<CacheService>;

  beforeEach(() => {
    cacheService = new CacheService() as jest.Mocked<CacheService>;
    cacheService.set = jest.fn().mockResolvedValue(undefined);
    cacheService.get = jest.fn().mockResolvedValue(null);
    cacheService.del = jest.fn().mockResolvedValue(undefined);
    service = new CsrfService(cacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateToken()', () => {
    it('should generate a 64-character hex token', async () => {
      const token = await service.generateToken('user-123');

      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(cacheService.set).toHaveBeenCalledWith(
        'csrf:token:user-123',
        token,
        7 * 24 * 60 * 60,
      );
    });

    it('should generate different tokens on each call', async () => {
      const token1 = await service.generateToken('user-123');
      const token2 = await service.generateToken('user-123');

      expect(token1).not.toBe(token2);
    });
  });

  describe('validateToken()', () => {
    it('should return false when token is empty', async () => {
      const result = await service.validateToken('user-123', '');
      expect(result).toBe(false);
    });

    it('should return false when no token is stored', async () => {
      cacheService.get.mockResolvedValueOnce(null);

      const result = await service.validateToken('user-123', 'some-token');
      expect(result).toBe(false);
    });

    it('should return true when submitted token matches stored token', async () => {
      const token = await service.generateToken('user-123');
      cacheService.get.mockResolvedValueOnce(token);

      const result = await service.validateToken('user-123', token);
      expect(result).toBe(true);
    });

    it('should return false when submitted token does not match stored token', async () => {
      const mismatchedToken = 'a'.repeat(64);
      cacheService.get.mockResolvedValueOnce('b'.repeat(64));

      const result = await service.validateToken('user-123', mismatchedToken);
      expect(result).toBe(false);
    });

    it('should return false when stored token is null', async () => {
      cacheService.get.mockResolvedValueOnce(null);

      const result = await service.validateToken('user-123', 'a'.repeat(64));
      expect(result).toBe(false);
    });
  });

  describe('deleteToken()', () => {
    it('should delete the CSRF token from Redis', async () => {
      await service.deleteToken('user-123');

      expect(cacheService.del).toHaveBeenCalledWith('csrf:token:user-123');
    });
  });
});
