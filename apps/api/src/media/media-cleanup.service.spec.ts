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
    // The service skips all cleanup unless ENABLE_BACKGROUND_JOBS=true
    // (resource-constrained hosts default to off) — the assertions below
    // exercise the ENABLED path, so the flag must be set for the duration
    // of these tests and restored afterwards.
    beforeEach(() => {
      process.env.ENABLE_BACKGROUND_JOBS = 'true';
    });
    afterEach(() => {
      delete process.env.ENABLE_BACKGROUND_JOBS;
    });

    it('should run cleanup without errors', async () => {
      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    });

    it('should query stale processing records', async () => {
      await service.onApplicationBootstrap();
      expect(mockPrisma.media.findMany).toHaveBeenCalled();
    });
  });
});
