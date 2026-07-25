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

describe('MediaService', () => {
  let service: MediaService;
  let mockStorage: StorageProvider;
  let mockProcessor: ImageProcessorService;
  let mockQueue: MediaCleanupQueueService;

  beforeEach(() => {
    jest.clearAllMocks();

    // clearAllMocks() preserves implementations but does NOT clear
    // mockResolvedValueOnce queues. Reset findFirst to prevent test pollution.
    mockPrisma.media.findFirst.mockReset();
    mockPrisma.media.findFirst.mockResolvedValue(null);

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
  });

  describe('upload', () => {
    const mockFile = {
      buffer: Buffer.from('image-data'),
      originalname: 'photo.jpg',
      mimetype: 'image/jpeg',
      size: 1024,
    } as Express.Multer.File;

    it('should upload a new file and create media record', async () => {
      mockPrisma.media.findFirst.mockResolvedValue(null);
      mockPrisma.media.create.mockResolvedValue({
        id: 'media-1',
        tenantId: 't1',
        entityType: 'product',
        entityId: 'p1',
        mediaType: 'IMAGE',
        originalName: 'photo.jpg',
        mimeType: 'image/jpeg',
        originalFileSize: 1024,
        fileSize: 100,
        checksum: 'abc123checksum',
        width: 800,
        height: 600,
        storageKey: 'key',
        storageProvider: 'LocalStorageProvider',
        originalUrl: '/url',
        thumbnailUrl: '/url',
        mediumUrl: '/url',
        largeUrl: '/url',
        status: 'ready',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.upload(mockFile, 'product', 'p1', 'IMAGE', 't1');

      expect(result.id).toBe('media-1');
      expect(mockStorage.upload).toHaveBeenCalled();
      expect(mockPrisma.media.create).toHaveBeenCalled();
    });

    it('should reject invalid MIME type', async () => {
      const badFile = { ...mockFile, mimetype: 'text/plain' };
      await expect(
        service.upload(badFile as any, 'product', 'p1', 'IMAGE', 't1'),
      ).rejects.toThrow('Invalid file type');
    });

    it('should reject oversized files', async () => {
      const bigFile = { ...mockFile, size: 99 * 1024 * 1024 };
      await expect(
        service.upload(bigFile as any, 'product', 'p1', 'IMAGE', 't1'),
      ).rejects.toThrow('File size');
    });

    it('should use dedup when checksum matches', async () => {
      mockPrisma.media.findFirst
        .mockResolvedValueOnce({ storageKey: 'existing-key', originalUrl: '/existing', thumbnailUrl: '/existing', mediumUrl: '/existing', largeUrl: '/existing', width: 800, height: 600, fileSize: 100 })
        .mockResolvedValueOnce(null); // existingMedia check returns null
      mockPrisma.media.create.mockResolvedValue({
        id: 'media-dedup', tenantId: 't1', entityType: 'product', entityId: 'p1',
        mediaType: 'IMAGE', originalName: 'photo.jpg', mimeType: 'image/jpeg',
        originalFileSize: 1024, fileSize: 100, checksum: 'abc123checksum',
        width: 800, height: 600, storageKey: 'existing-key', storageProvider: 'LocalStorageProvider',
        originalUrl: '/existing', thumbnailUrl: '/existing', mediumUrl: '/existing', largeUrl: '/existing',
        status: 'ready', createdAt: new Date(), updatedAt: new Date(),
      });

      const result = await service.upload(mockFile, 'product', 'p1', 'IMAGE', 't1');

      expect(result.storageKey).toBe('existing-key');
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it('should delete old media and enqueue cleanup when replacement refcount = 0 after deletion', async () => {
      const oldMedia = { id: 'old-m1', storageKey: 'old-key', originalUrl: '/old', thumbnailUrl: '/old', mediumUrl: '/old', largeUrl: '/old', width: 800, height: 600, fileSize: 100 };
      mockPrisma.media.findFirst
        .mockResolvedValueOnce(null)    // dedup check
        .mockResolvedValueOnce(oldMedia) // existingMedia check
        .mockResolvedValueOnce(oldMedia); // re-read inside tx
      mockPrisma.media.count.mockResolvedValue(0);
      mockPrisma.media.create.mockResolvedValue({
        id: 'new-m1', tenantId: 't1', entityType: 'product', entityId: 'p1',
        mediaType: 'IMAGE', originalName: 'photo.jpg', mimeType: 'image/jpeg',
        originalFileSize: 1024, fileSize: 200, checksum: 'new-checksum',
        width: 800, height: 600, storageKey: 'new-key', storageProvider: 'LocalStorageProvider',
        originalUrl: '/new', thumbnailUrl: '/new', mediumUrl: '/new', largeUrl: '/new',
        status: 'ready', createdAt: new Date(), updatedAt: new Date(),
      });

      await service.upload(mockFile, 'product', 'p1', 'IMAGE', 't1');

      expect(mockPrisma.media.deleteMany).toHaveBeenCalledWith({ where: { id: 'old-m1' } });
      expect(mockQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'REPLACE' }),
      );
    });

    it('should not enqueue cleanup when new Media shares storageKey (refcount > 0 after deletion)', async () => {
      const oldMedia = { id: 'old-m1', storageKey: 'shared-key', originalUrl: '/old', thumbnailUrl: '/old', mediumUrl: '/old', largeUrl: '/old', width: 800, height: 600, fileSize: 100 };
      mockPrisma.media.findFirst
        .mockResolvedValueOnce({ storageKey: 'shared-key', originalUrl: '/old', thumbnailUrl: '/old', mediumUrl: '/old', largeUrl: '/old', width: 800, height: 600, fileSize: 100 }) // dedup
        .mockResolvedValueOnce(oldMedia) // existingMedia check
        .mockResolvedValueOnce(oldMedia); // re-read inside tx
      mockPrisma.media.count.mockResolvedValue(1);
      mockPrisma.media.create.mockResolvedValue({
        id: 'new-m1', tenantId: 't1', entityType: 'product', entityId: 'p1',
        mediaType: 'IMAGE', originalName: 'photo.jpg', mimeType: 'image/jpeg',
        originalFileSize: 1024, fileSize: 200, checksum: 'abc123checksum',
        width: 800, height: 600, storageKey: 'shared-key', storageProvider: 'LocalStorageProvider',
        originalUrl: '/old', thumbnailUrl: '/old', mediumUrl: '/old', largeUrl: '/old',
        status: 'ready', createdAt: new Date(), updatedAt: new Date(),
      });

      await service.upload(mockFile, 'product', 'p1', 'IMAGE', 't1');

      expect(mockPrisma.media.deleteMany).toHaveBeenCalledWith({ where: { id: 'old-m1' } });
      expect(mockQueue.enqueue).not.toHaveBeenCalled();
    });

    it('should handle two concurrent replacements for the same entity/mediaType correctly', async () => {
      const oldMedia = { id: 'old-m1', storageKey: 'old-key', originalUrl: '/old', thumbnailUrl: '/old', mediumUrl: '/old', largeUrl: '/old', width: 800, height: 600, fileSize: 100 };

      // Each upload() makes 3 findFirst calls:
      //   1. Dedup check by checksum → null
      //   2. Existing media check by entityType/entityId/mediaType → oldMedia
      //   3. Re-read inside SERIALIZABLE tx by id → oldMedia
      let findFirstCallCount = 0;
      mockPrisma.media.findFirst.mockImplementation(async (args: any) => {
        findFirstCallCount++;
        if (args.where?.checksum) {
          return null; // dedup check
        }
        if (args.where?.id === oldMedia.id) {
          return oldMedia; // re-read inside tx or existingMedia check
        }
        return oldMedia; // existingMedia check
      });

      // Both create new records with different storageKeys
      mockPrisma.media.create
        .mockResolvedValueOnce({
          id: 'new-a', tenantId: 't1', entityType: 'product', entityId: 'p1',
          mediaType: 'IMAGE', originalName: 'a.jpg', mimeType: 'image/jpeg',
          originalFileSize: 1024, fileSize: 200, checksum: 'checksum-a',
          width: 800, height: 600, storageKey: 'new-key-a', storageProvider: 'LocalStorageProvider',
          originalUrl: '/new-a', thumbnailUrl: '/new-a', mediumUrl: '/new-a', largeUrl: '/new-a',
          status: 'ready', createdAt: new Date(), updatedAt: new Date(),
        })
        .mockResolvedValueOnce({
          id: 'new-b', tenantId: 't1', entityType: 'product', entityId: 'p1',
          mediaType: 'IMAGE', originalName: 'b.jpg', mimeType: 'image/jpeg',
          originalFileSize: 1024, fileSize: 200, checksum: 'checksum-b',
          width: 800, height: 600, storageKey: 'new-key-b', storageProvider: 'LocalStorageProvider',
          originalUrl: '/new-b', thumbnailUrl: '/new-b', mediumUrl: '/new-b', largeUrl: '/new-b',
          status: 'ready', createdAt: new Date(), updatedAt: new Date(),
        });

      // Both transactions check refcount after deletion: 0 = no remaining refs → enqueue cleanup
      mockPrisma.media.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const [resultA, resultB] = await Promise.all([
        service.upload(mockFile, 'product', 'p1', 'IMAGE', 't1'),
        service.upload(mockFile, 'product', 'p1', 'IMAGE', 't1'),
      ]);

      // Both complete successfully with distinct records
      // 2 uploads × 3 findFirst each: dedup + existingMedia + re-read inside tx
      expect(findFirstCallCount).toBe(6);
      const ids = [resultA.id, resultB.id];
      expect(ids).toContain('new-a');
      expect(ids).toContain('new-b');
      expect(resultA.id).not.toBe(resultB.id);

      // Both transactions called deleteMany for the old record (second is idempotent no-op)
      expect(mockPrisma.media.deleteMany).toHaveBeenCalledTimes(2);
      expect(mockPrisma.media.deleteMany).toHaveBeenCalledWith({ where: { id: 'old-m1' } });

      // Both transactions checked refcount after deletion
      expect(mockPrisma.media.count).toHaveBeenCalledTimes(2);

      // Both enqueued cleanup for old storageKey (both see refcount = 0)
      // Cleanup queue re-verifies refcount before actual file deletion
      expect(mockQueue.enqueue).toHaveBeenCalledTimes(2);
      expect(mockQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'REPLACE', storageKeys: expect.arrayContaining(['old-key-original.webp']) }),
      );
    });

    it('should synchronously delete files from failed attempt before retrying on serialization error', async () => {
      mockPrisma.media.findFirst
        .mockResolvedValue(null) // dedup check → null for all calls
        .mockResolvedValue(null); // existingMedia check → null

      const error = Object.assign(new Error('serialization failure'), { code: '40001' });

      let transactionCallCount = 0;
      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        transactionCallCount++;
        if (transactionCallCount === 1) {
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

      // Files from failed attempt were synchronously deleted before retry
      expect(mockStorage.deleteBatch).toHaveBeenCalledTimes(1);
      // Keys follow the pattern: tenants/t1/image/{timestamp}-{checksum8}-{size}.webp
      const deletedKeys = mockStorage.deleteBatch.mock.calls[0][0];
      expect(deletedKeys).toHaveLength(4);
      expect(deletedKeys[0]).toMatch(/^tenants\/t1\/image\/.*-original\.webp$/);
      expect(deletedKeys[1]).toMatch(/^tenants\/t1\/image\/.*-thumbnail\.webp$/);
      expect(deletedKeys[2]).toMatch(/^tenants\/t1\/image\/.*-medium\.webp$/);
      expect(deletedKeys[3]).toMatch(/^tenants\/t1\/image\/.*-large\.webp$/);

      // Transaction was called twice: fail + retry success
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('should leave zero leaked files after all retries fail', async () => {
      mockPrisma.media.findFirst.mockResolvedValue(null);

      const error = Object.assign(new Error('serialization failure'), { code: '40001' });
      mockPrisma.$transaction.mockRejectedValue(error);

      await expect(
        service.upload(mockFile, 'product', 'p1', 'IMAGE', 't1'),
      ).rejects.toThrow();

      // 3 attempts × 4 files uploaded per attempt = 12 uploads
      expect(mockStorage.upload).toHaveBeenCalledTimes(12);
      // After each attempt's failure, deleteBatch is called with 4 keys
      expect(mockStorage.deleteBatch).toHaveBeenCalledTimes(3);
      for (const call of mockStorage.deleteBatch.mock.calls) {
        expect(call[0]).toHaveLength(4);
        expect(call[0][0]).toMatch(/-original\.webp$/);
        expect(call[0][1]).toMatch(/-thumbnail\.webp$/);
        expect(call[0][2]).toMatch(/-medium\.webp$/);
        expect(call[0][3]).toMatch(/-large\.webp$/);
      }

      // No database records created
      expect(mockPrisma.media.create).not.toHaveBeenCalled();
      expect(mockQueue.enqueue).not.toHaveBeenCalled();
    });

    it('should keep only committed files after successful retry', async () => {
      mockPrisma.media.findFirst
        .mockResolvedValue(null) // dedup check
        .mockResolvedValue(null); // existingMedia check

      const error = Object.assign(new Error('serialization failure'), { code: '40001' });

      let transactionCallCount = 0;
      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        transactionCallCount++;
        if (transactionCallCount === 1) {
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

      // Attempt 1 files deleted synchronously, attempt 2 files remain in storage
      expect(mockStorage.deleteBatch).toHaveBeenCalledTimes(1);
      expect(result.id).toBe('new-m1');

      // Media record created for the committed attempt
      expect(mockPrisma.media.create).toHaveBeenCalledTimes(1);
    });

    it('should enqueue ROLLBACK cleanup for files that failed to delete during retry', async () => {
      mockPrisma.media.findFirst
        .mockResolvedValue(null) // dedup check
        .mockResolvedValue(null); // existingMedia check

      const error = Object.assign(new Error('serialization failure'), { code: '40001' });

      let transactionCallCount = 0;
      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        transactionCallCount++;
        if (transactionCallCount === 1) {
          throw error;
        }
        return cb(mockPrisma);
      });

      (mockStorage.deleteBatch as jest.Mock).mockResolvedValueOnce({
        deleted: ['ok-key-original.webp'],
        failed: [
          { key: 'ok-key-thumbnail.webp', reason: 'permission denied' },
          { key: 'ok-key-medium.webp', reason: 'permission denied' },
        ],
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

      // Failed keys were enqueued for async cleanup
      expect(mockQueue.enqueue).toHaveBeenCalledWith({
        type: 'ROLLBACK',
        storageKeys: ['ok-key-thumbnail.webp', 'ok-key-medium.webp'],
      });
    });

    it('should not enqueue ROLLBACK when all files are deleted successfully', async () => {
      mockPrisma.media.findFirst
        .mockResolvedValue(null)
        .mockResolvedValue(null);

      const error = Object.assign(new Error('serialization failure'), { code: '40001' });

      let transactionCallCount = 0;
      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        transactionCallCount++;
        if (transactionCallCount === 1) {
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

      // No old record to replace, and deleteBatch succeeded → no enqueue at all
      expect(mockQueue.enqueue).not.toHaveBeenCalled();
    });

    it('should clean up successfully uploaded files when Promise.all partially fails (Fix A)', async () => {
      // This tests the actual bug: all 4 uploads succeed, then $transaction
      // fails with serialization error. Keys must be tracked BEFORE Promise.all
      // so the catch block can clean them up.
      mockPrisma.media.findFirst.mockResolvedValue(null);

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

      // Attempt 1: 4 uploads succeed → $transaction fails → files cleaned up
      // Attempt 2: 4 uploads succeed → $transaction succeeds → files committed
      // Total: 8 uploads, 1 deleteBatch (for attempt 1 cleanup)
      expect(mockStorage.upload).toHaveBeenCalledTimes(8);
      expect(mockStorage.deleteBatch).toHaveBeenCalledTimes(1);
      const deletedKeys = mockStorage.deleteBatch.mock.calls[0][0];
      expect(deletedKeys).toHaveLength(4);
      expect(deletedKeys[0]).toMatch(/-original\.webp$/);
      expect(deletedKeys[1]).toMatch(/-thumbnail\.webp$/);
      expect(deletedKeys[2]).toMatch(/-medium\.webp$/);
      expect(deletedKeys[3]).toMatch(/-large\.webp$/);
    });

    it('should generate correct keys for DOCUMENT cleanup (no double .pdf) (Fix B)', async () => {
      const docFile = {
        buffer: Buffer.from('pdf-data'),
        originalname: 'doc.pdf',
        mimetype: 'application/pdf',
        size: 2048,
      } as Express.Multer.File;

      const oldDocMedia = {
        id: 'old-doc', storageKey: 'tenants/t1/document/old-doc.pdf',
        originalUrl: '/old', thumbnailUrl: null, mediumUrl: null, largeUrl: null,
        width: null, height: null, fileSize: 100,
      };

      mockPrisma.media.findFirst
        .mockResolvedValueOnce(null) // dedup check
        .mockResolvedValueOnce(oldDocMedia) // existingMedia check
        .mockResolvedValueOnce(oldDocMedia); // re-read inside tx
      mockPrisma.media.count.mockResolvedValue(0);

      mockPrisma.media.create.mockResolvedValue({
        id: 'doc-1', tenantId: 't1', entityType: 'product', entityId: 'p1',
        mediaType: 'DOCUMENT', originalName: 'doc.pdf', mimeType: 'application/pdf',
        originalFileSize: 2048, fileSize: 2048, checksum: 'abc123checksum',
        width: null, height: null, storageKey: 'tenants/t1/document/new-doc.pdf',
        storageProvider: 'LocalStorageProvider',
        originalUrl: '/url/doc.pdf', thumbnailUrl: null, mediumUrl: null, largeUrl: null,
        status: 'ready', createdAt: new Date(), updatedAt: new Date(),
      });

      await service.upload(docFile, 'product', 'p1', 'DOCUMENT', 't1');

      // Cleanup should enqueue the storageKey itself (not storageKey.pdf)
      const enqueueCall = mockQueue.enqueue.mock.calls.find(
        (c: any[]) => c[0].type === 'REPLACE',
      );
      expect(enqueueCall).toBeDefined();
      const keys = enqueueCall[0].storageKeys;
      expect(keys).toContain('tenants/t1/document/old-doc.pdf');
      expect(keys).not.toContain('tenants/t1/document/old-doc.pdf.pdf');
    });
  });

  describe('findAll', () => {
    it('should return media list for tenant', async () => {
      mockPrisma.media.findMany.mockResolvedValue([{
        id: 'm1', tenantId: 't1', entityType: 'product', entityId: 'p1',
        mediaType: 'IMAGE', originalName: 'a.jpg', mimeType: 'image/jpeg',
        originalFileSize: 100, fileSize: 80, checksum: 'abc',
        width: 200, height: 200, storageKey: 'k', storageProvider: 'local',
        originalUrl: '/u', thumbnailUrl: null, mediumUrl: null, largeUrl: null,
        status: 'ready', createdAt: new Date(), updatedAt: new Date(),
      }]);

      const result = await service.findAll('t1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('m1');
    });
  });

  describe('findOne', () => {
    it('should return a media record', async () => {
      mockPrisma.media.findFirst.mockResolvedValue({
        id: 'm1', tenantId: 't1', entityType: 'product', entityId: 'p1',
        mediaType: 'IMAGE', originalName: 'a.jpg', mimeType: 'image/jpeg',
        originalFileSize: 100, fileSize: 80, checksum: 'abc',
        width: 200, height: 200, storageKey: 'k', storageProvider: 'local',
        originalUrl: '/u', thumbnailUrl: null, mediumUrl: null, largeUrl: null,
        status: 'ready', createdAt: new Date(), updatedAt: new Date(),
      });

      const result = await service.findOne('m1', 't1');
      expect(result.id).toBe('m1');
    });

    it('should throw NotFoundException for missing media', async () => {
      mockPrisma.media.findFirst.mockResolvedValue(null);
      await expect(service.findOne('missing', 't1')).rejects.toThrow('not found');
    });
  });

  describe('remove', () => {
    it('should delete media and enqueue cleanup when refcount = 0 after deletion (sole reference)', async () => {
      mockPrisma.media.findFirst.mockResolvedValue({
        id: 'm1', tenantId: 't1', entityType: 'product', entityId: 'p1',
        mediaType: 'IMAGE', storageKey: 'key-to-delete',
      });
      mockPrisma.media.count.mockResolvedValue(0);

      await service.remove('m1', 't1');

      expect(mockPrisma.media.deleteMany).toHaveBeenCalledWith({ where: { id: 'm1' } });
      expect(mockQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'DELETE' }),
      );
    });

    it('should not enqueue file deletion when refcount > 0 after deletion (shared dedup)', async () => {
      mockPrisma.media.findFirst.mockResolvedValue({
        id: 'm1', tenantId: 't1', entityType: 'product', entityId: 'p1',
        mediaType: 'IMAGE', storageKey: 'shared-key',
      });
      mockPrisma.media.count.mockResolvedValue(1);

      await service.remove('m1', 't1');

      expect(mockPrisma.media.deleteMany).toHaveBeenCalledWith({ where: { id: 'm1' } });
      expect(mockQueue.enqueue).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for missing media', async () => {
      mockPrisma.media.findFirst.mockResolvedValue(null);
      await expect(service.remove('missing', 't1')).rejects.toThrow('not found');
    });
  });
});
