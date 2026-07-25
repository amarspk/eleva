import { MediaCleanupService } from './media-cleanup.service';

jest.mock('@zayjar/db', () => {
  const mockPrisma = {
    media: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
  };
  return { prisma: mockPrisma };
});

const { prisma: mockPrisma } = require('@zayjar/db');

describe('MediaCleanupService', () => {
  let service: MediaCleanupService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MediaCleanupService();
  });

  describe('onApplicationBootstrap', () => {
    it('should run cleanup without errors', async () => {
      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    });

    it('should query stale processing records', async () => {
      await service.onApplicationBootstrap();
      expect(mockPrisma.media.findMany).toHaveBeenCalled();
    });
  });
});
