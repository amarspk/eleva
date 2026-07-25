import { LocalStorageProvider } from './local-storage.provider';
import * as fs from 'fs/promises';

jest.mock('fs/promises');
const mockFs = jest.mocked(fs);

describe('LocalStorageProvider', () => {
  let provider: LocalStorageProvider;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.STORAGE_LOCAL_PATH = '/tmp/test-uploads';
    provider = new LocalStorageProvider();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('upload', () => {
    it('should create directory and write file', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const buffer = Buffer.from('test-content');
      const result = await provider.upload('tenant-123/logo/file.webp', buffer, 'image/webp');

      expect(mockFs.mkdir).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalled();
      expect(result.storageKey).toBe('tenant-123/logo/file.webp');
      expect(result.url).toBe('/uploads/tenant-123/logo/file.webp');
      expect(result.size).toBe(buffer.length);
    });
  });

  describe('delete', () => {
    it('should delete file successfully', async () => {
      mockFs.unlink.mockResolvedValue(undefined);
      await provider.delete('tenant-123/logo/file.webp');
      expect(mockFs.unlink).toHaveBeenCalled();
    });

    it('should ignore ENOENT errors', async () => {
      const enoent = Object.assign(new Error('not found'), { code: 'ENOENT' });
      mockFs.unlink.mockRejectedValue(enoent);
      await expect(provider.delete('missing-file')).resolves.toBeUndefined();
    });
  });

  describe('deleteBatch', () => {
    it('should return all keys in deleted when all succeed', async () => {
      mockFs.unlink.mockResolvedValue(undefined);
      const result = await provider.deleteBatch(['key1', 'key2', 'key3']);
      expect(result.deleted).toEqual(['key1', 'key2', 'key3']);
      expect(result.failed).toEqual([]);
    });

    it('should treat ENOENT as successful deletion', async () => {
      const enoent = Object.assign(new Error('not found'), { code: 'ENOENT' });
      mockFs.unlink.mockRejectedValue(enoent);
      const result = await provider.deleteBatch(['missing-key']);
      expect(result.deleted).toEqual(['missing-key']);
      expect(result.failed).toEqual([]);
    });

    it('should continue deleting remaining files after a non-ENOENT failure', async () => {
      const eacces = Object.assign(new Error('permission denied'), { code: 'EACCES' });
      mockFs.unlink
        .mockRejectedValueOnce(eacces)
        .mockResolvedValueOnce(undefined);

      const result = await provider.deleteBatch(['bad-key', 'good-key']);
      expect(result.deleted).toEqual(['good-key']);
      expect(result.failed).toEqual([{ key: 'bad-key', reason: 'permission denied' }]);
    });

    it('should collect multiple failures and successes', async () => {
      const ebusy = Object.assign(new Error('resource busy'), { code: 'EBUSY' });
      mockFs.unlink
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(ebusy)
        .mockResolvedValueOnce(undefined);

      const result = await provider.deleteBatch(['ok1', 'busy', 'ok2']);
      expect(result.deleted).toEqual(['ok1', 'ok2']);
      expect(result.failed).toEqual([{ key: 'busy', reason: 'resource busy' }]);
    });

    it('should return empty deleted/failed for empty input', async () => {
      const result = await provider.deleteBatch([]);
      expect(result.deleted).toEqual([]);
      expect(result.failed).toEqual([]);
    });
  });

  describe('getPublicUrl', () => {
    it('should return /uploads/ prefixed URL', () => {
      const url = provider.getPublicUrl('tenant-123/file.webp');
      expect(url).toBe('/uploads/tenant-123/file.webp');
    });
  });
});
