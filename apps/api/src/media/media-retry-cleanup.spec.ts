import { MediaService } from './media.service';
import { StorageProvider } from './storage/storage-provider.interface';
import { ImageProcessorService } from './image-processor.service';
import { MediaCleanupQueueService } from './media-cleanup-queue.service';

jest.mock('@zayjar/db', () => {
  const mockPrisma = {
    media: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    tenant: { update: jest.fn() },
    product: { update: jest.fn() },
    $transaction: jest.fn((cb: any) => cb(mockPrisma)),
  };
  return { prisma: mockPrisma };
});

const { prisma: mockPrisma } = require('@zayjar/db');

describe('MediaService — retry cleanup (TSK-5.7)', () => {
  let service: MediaService;
  let mockStorage: StorageProvider;
  let mockProcessor: ImageProcessorService;
  let mockQueue: MediaCleanupQueueService;

  const mockFile = {
    buffer: Buffer.from('image-data'),
    originalname: 'photo.jpg',
    mimetype: 'image/jpeg',
    size: 1024,
  } as Express.Multer.File;

  beforeEach(() => {
    jest.clearAllMocks();

    mockStorage = {
      upload: jest.fn().mockResolvedValue({ storageKey: 'key', url: '/url', size: 100 }),
      delete: jest.fn(),
      deleteBatch: jest.fn().mockImplementation(async (keys: string[]) => ({
        deleted: keys,
        failed: [],
      })),
      getPublicUrl: jest.fn(),
    };

    mockProcessor = {
      processImage: jest.fn().mockResolvedValue({
        original: { buffer: Buffer.from('orig'), width: 800, height: 600 },
        thumbnail: { buffer: Buffer.from('thumb'), width: 200, height: 200 },
        medium: { buffer: Buffer.from('med'), width: 600, height: 600 },
        large: { buffer: Buffer.from('lg'), width: 1200, height: 1200 },
      }),
      computeChecksum: jest.fn().mockReturnValue('abc123checksum'),
    } as any;

    mockQueue = {
      enqueue: jest.fn(),
    } as any;

    service = new MediaService(mockStorage, mockProcessor, mockQueue);

    mockPrisma.media.findFirst.mockResolvedValue(null);
  });

  describe('serialization failure → retry → no leaked files', () => {
    it('should synchronously delete files from failed attempt before next retry', async () => {
      const error = Object.assign(new Error('serialization failure'), { code: '40001' });
      let txCount = 0;

      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        txCount++;
        if (txCount === 1) {
          throw error;
        }
        return cb(mockPrisma);
      });

      mockPrisma.media.create.mockResolvedValue({
        id: 'new-m1', tenantId: 't1', entityType: 'product', entityId: 'p1',
        mediaType: 'IMAGE', originalName: 'photo.jpg', mimeType: 'image/jpeg',
        originalFileSize: 1024, fileSize: 200, checksum: 'abc123checksum',
        width: 800, height: 600, storageKey: 'key', storageProvider: 'LocalStorageProvider',
        originalUrl: '/url', thumbnailUrl: '/url', mediumUrl: '/url', largeUrl: '/url',
        status: 'ready', createdAt: new Date(), updatedAt: new Date(),
      });

      await service.upload(mockFile, 'product', 'p1', 'IMAGE', 't1');

      // Attempt 1 files were cleaned up synchronously
      expect(mockStorage.deleteBatch).toHaveBeenCalledTimes(1);
      const deletedKeys = mockStorage.deleteBatch.mock.calls[0][0];
      expect(deletedKeys).toHaveLength(4);
      deletedKeys.forEach((k: string) => expect(k).toMatch(/\.webp$/));

      // Only 1 cleanup call — attempt 2 succeeded, no cleanup needed
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    });
  });

  describe('all retries exhausted → zero leaked files', () => {
    it('should delete files from every failed attempt', async () => {
      const error = Object.assign(new Error('serialization failure'), { code: '40001' });
      mockPrisma.$transaction.mockRejectedValue(error);

      await expect(
        service.upload(mockFile, 'product', 'p1', 'IMAGE', 't1'),
      ).rejects.toThrow();

      // 3 attempts × 4 files uploaded per attempt
      expect(mockStorage.upload).toHaveBeenCalledTimes(12);
      // After each of 3 attempts, all files were deleted synchronously
      expect(mockStorage.deleteBatch).toHaveBeenCalledTimes(3);
      for (const call of mockStorage.deleteBatch.mock.calls) {
        expect(call[0]).toHaveLength(4);
      }

      // No records created, no cleanup enqueued
      expect(mockPrisma.media.create).not.toHaveBeenCalled();
      expect(mockQueue.enqueue).not.toHaveBeenCalled();
    });

    it('should not leak files when non-serialization errors occur (no retry)', async () => {
      mockPrisma.$transaction.mockRejectedValue(new Error('connection refused'));

      await expect(
        service.upload(mockFile, 'product', 'p1', 'IMAGE', 't1'),
      ).rejects.toThrow('connection refused');

      // 1 attempt × 4 files uploaded, then cleaned up
      expect(mockStorage.upload).toHaveBeenCalledTimes(4);
      // Non-serialization errors are NOT retried, so no cleanup happens
      // (the error is thrown before cleanup, and serializableRetry does not retry)
      expect(mockStorage.deleteBatch).toHaveBeenCalledTimes(0);
    });
  });

  describe('successful retry → only committed files remain', () => {
    it('should only delete failed attempt files, keep successful attempt files', async () => {
      const error = Object.assign(new Error('serialization failure'), { code: '40001' });
      let txCount = 0;

      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        txCount++;
        if (txCount <= 2) {
          throw error;
        }
        return cb(mockPrisma);
      });

      mockPrisma.media.create.mockResolvedValue({
        id: 'new-m1', tenantId: 't1', entityType: 'product', entityId: 'p1',
        mediaType: 'IMAGE', originalName: 'photo.jpg', mimeType: 'image/jpeg',
        originalFileSize: 1024, fileSize: 200, checksum: 'abc123checksum',
        width: 800, height: 600, storageKey: 'key', storageProvider: 'LocalStorageProvider',
        originalUrl: '/url', thumbnailUrl: '/url', mediumUrl: '/url', largeUrl: '/url',
        status: 'ready', createdAt: new Date(), updatedAt: new Date(),
      });

      const result = await service.upload(mockFile, 'product', 'p1', 'IMAGE', 't1');

      // 3 attempts: 2 failed, 1 succeeded
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
      // Attempt 1 and 2 files cleaned up; attempt 3 files remain
      expect(mockStorage.deleteBatch).toHaveBeenCalledTimes(2);
      // 3 attempts × 4 uploads =12
      expect(mockStorage.upload).toHaveBeenCalledTimes(12);
      // Media record created once (successful attempt only)
      expect(mockPrisma.media.create).toHaveBeenCalledTimes(1);
      expect(result.id).toBe('new-m1');
    });

    it('should not enqueue cleanup for successfully committed files', async () => {
      const error = Object.assign(new Error('serialization failure'), { code: '40001' });
      let txCount = 0;

      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        txCount++;
        if (txCount === 1) {
          throw error;
        }
        return cb(mockPrisma);
      });

      mockPrisma.media.create.mockResolvedValue({
        id: 'new-m1', tenantId: 't1', entityType: 'product', entityId: 'p1',
        mediaType: 'IMAGE', originalName: 'photo.jpg', mimeType: 'image/jpeg',
        originalFileSize: 1024, fileSize: 200, checksum: 'abc123checksum',
        width: 800, height: 600, storageKey: 'key', storageProvider: 'LocalStorageProvider',
        originalUrl: '/url', thumbnailUrl: '/url', mediumUrl: '/url', largeUrl: '/url',
        status: 'ready', createdAt: new Date(), updatedAt: new Date(),
      });

      await service.upload(mockFile, 'product', 'p1', 'IMAGE', 't1');

      // No old record to replace → no enqueue
      expect(mockQueue.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('cleanup is synchronous before retry', () => {
    it('should call deleteBatch before the next $transaction call', async () => {
      const callOrder: string[] = [];

      mockStorage.upload.mockImplementation(async () => {
        callOrder.push('upload');
        return { storageKey: 'key', url: '/url', size: 100 };
      });

      mockStorage.deleteBatch.mockImplementation(async (keys: string[]) => {
        callOrder.push('deleteBatch');
        return { deleted: keys, failed: [] };
      });

      const error = Object.assign(new Error('serialization failure'), { code: '40001' });
      let txCount = 0;

      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        txCount++;
        callOrder.push(`transaction-${txCount}`);
        if (txCount === 1) {
          throw error;
        }
        return cb(mockPrisma);
      });

      mockPrisma.media.create.mockResolvedValue({
        id: 'new-m1', tenantId: 't1', entityType: 'product', entityId: 'p1',
        mediaType: 'IMAGE', originalName: 'photo.jpg', mimeType: 'image/jpeg',
        originalFileSize: 1024, fileSize: 200, checksum: 'abc123checksum',
        width: 800, height: 600, storageKey: 'key', storageProvider: 'LocalStorageProvider',
        originalUrl: '/url', thumbnailUrl: '/url', mediumUrl: '/url', largeUrl: '/url',
        status: 'ready', createdAt: new Date(), updatedAt: new Date(),
      });

      await service.upload(mockFile, 'product', 'p1', 'IMAGE', 't1');

      // Expected order:
      // upload(×4), transaction-1(FAIL), deleteBatch, upload(×4), transaction-2(SUCCESS)
      expect(callOrder).toEqual([
        'upload', 'upload', 'upload', 'upload',
        'transaction-1',
        'deleteBatch',
        'upload', 'upload', 'upload', 'upload',
        'transaction-2',
      ]);
    });
  });

  describe('deadlock retry (Fix C)', () => {
    it('should retry on PostgreSQL deadlock error (code 40P01)', async () => {
      const deadlockError = Object.assign(new Error('deadlock detected'), { code: '40P01' });
      let txCount = 0;

      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        txCount++;
        if (txCount === 1) {
          throw deadlockError;
        }
        return cb(mockPrisma);
      });

      mockPrisma.media.create.mockResolvedValue({
        id: 'new-m1', tenantId: 't1', entityType: 'product', entityId: 'p1',
        mediaType: 'IMAGE', originalName: 'photo.jpg', mimeType: 'image/jpeg',
        originalFileSize: 1024, fileSize: 200, checksum: 'abc123checksum',
        width: 800, height: 600, storageKey: 'key', storageProvider: 'LocalStorageProvider',
        originalUrl: '/url', thumbnailUrl: '/url', mediumUrl: '/url', largeUrl: '/url',
        status: 'ready', createdAt: new Date(), updatedAt: new Date(),
      });

      await service.upload(mockFile, 'product', 'p1', 'IMAGE', 't1');

      // Deadlock on attempt 1 → files cleaned up → retry succeeds
      expect(mockStorage.deleteBatch).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('should clean up files on deadlock before retry', async () => {
      const deadlockError = Object.assign(new Error('deadlock detected'), { code: '40P01' });
      let txCount = 0;

      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        txCount++;
        if (txCount === 1) {
          throw deadlockError;
        }
        return cb(mockPrisma);
      });

      mockPrisma.media.create.mockResolvedValue({
        id: 'new-m1', tenantId: 't1', entityType: 'product', entityId: 'p1',
        mediaType: 'IMAGE', originalName: 'photo.jpg', mimeType: 'image/jpeg',
        originalFileSize: 1024, fileSize: 200, checksum: 'abc123checksum',
        width: 800, height: 600, storageKey: 'key', storageProvider: 'LocalStorageProvider',
        originalUrl: '/url', thumbnailUrl: '/url', mediumUrl: '/url', largeUrl: '/url',
        status: 'ready', createdAt: new Date(), updatedAt: new Date(),
      });

      await service.upload(mockFile, 'product', 'p1', 'IMAGE', 't1');

      const deletedKeys = mockStorage.deleteBatch.mock.calls[0][0];
      expect(deletedKeys).toHaveLength(4);
      deletedKeys.forEach((k: string) => expect(k).toMatch(/\.webp$/));
    });
  });
});
