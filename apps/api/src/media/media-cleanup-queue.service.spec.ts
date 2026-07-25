import { MediaCleanupQueueService } from './media-cleanup-queue.service';
import { StorageProvider } from './storage/storage-provider.interface';

describe('MediaCleanupQueueService', () => {
  let service: MediaCleanupQueueService;
  let mockStorage: StorageProvider;

  beforeEach(() => {
    mockStorage = {
      upload: jest.fn(),
      delete: jest.fn(),
      deleteBatch: jest.fn().mockResolvedValue(undefined),
      getPublicUrl: jest.fn(),
    };
    service = new MediaCleanupQueueService(mockStorage);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('enqueue', () => {
    it('should add a job to the queue', () => {
      expect(service.pendingCount).toBe(0);
      service.enqueue({ type: 'DELETE', storageKeys: ['key1'] });
      expect(service.pendingCount).toBe(1);
    });

    it('should initialize attempts to 0', () => {
      service.enqueue({ type: 'DELETE', storageKeys: ['key1'] });
      expect(service.pendingCount).toBe(1);
    });
  });

  describe('processing', () => {
    it('should process queued jobs and call deleteBatch', async () => {
      service.enqueue({ type: 'DELETE', storageKeys: ['key1', 'key2'] });

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(mockStorage.deleteBatch).toHaveBeenCalledWith(['key1', 'key2']);
      expect(service.pendingCount).toBe(0);
    });

    it('should retry failed jobs up to MAX_RETRIES', async () => {
      (mockStorage.deleteBatch as jest.Mock)
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValueOnce(undefined);

      service.enqueue({ type: 'REPLACE', storageKeys: ['retry-key'] });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(mockStorage.deleteBatch).toHaveBeenCalled();
    }, 10000);

    it('should permanently fail after MAX_RETRIES', async () => {
      (mockStorage.deleteBatch as jest.Mock).mockRejectedValue(new Error('persistent failure'));

      service.enqueue({ type: 'DELETE', storageKeys: ['dead-key'] });

      // Backoff: 2s + 4s = 6s total for 3 attempts
      await new Promise((resolve) => setTimeout(resolve, 8000));

      expect(service.pendingCount).toBe(0);
    }, 15000);

    it('should handle two duplicate cleanup jobs for the same storageKey safely', async () => {
      service.enqueue({ type: 'REPLACE', storageKeys: ['dup-key-original.webp', 'dup-key-thumbnail.webp'] });
      service.enqueue({ type: 'REPLACE', storageKeys: ['dup-key-original.webp', 'dup-key-thumbnail.webp'] });

      expect(service.pendingCount).toBe(2);

      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(mockStorage.deleteBatch).toHaveBeenCalledTimes(2);
      expect(mockStorage.deleteBatch).toHaveBeenCalledWith(['dup-key-original.webp', 'dup-key-thumbnail.webp']);
      expect(service.pendingCount).toBe(0);
    });

    it('should not throw when second cleanup job deletes already-removed files', async () => {
      let deleteCount = 0;
      (mockStorage.deleteBatch as jest.Mock).mockImplementation(async () => {
        deleteCount++;
      });

      service.enqueue({ type: 'DELETE', storageKeys: ['shared-key'] });
      service.enqueue({ type: 'DELETE', storageKeys: ['shared-key'] });

      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(deleteCount).toBe(2);
      expect(service.pendingCount).toBe(0);
    });
  });
});
