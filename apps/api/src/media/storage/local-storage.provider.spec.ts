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

  describe('getPublicUrl', () => {
    it('should return /uploads/ prefixed URL', () => {
      const url = provider.getPublicUrl('tenant-123/file.webp');
      expect(url).toBe('/uploads/tenant-123/file.webp');
    });
  });
});
