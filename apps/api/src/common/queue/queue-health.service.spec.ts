import { Test, TestingModule } from '@nestjs/testing';
import { QueueHealthService } from './queue-health.service';

describe('QueueHealthService — DOC-010 §9.4', () => {
  let service: QueueHealthService;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.REDIS_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('when Redis is not configured', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [QueueHealthService],
      }).compile();

      service = module.get<QueueHealthService>(QueueHealthService);
    });

    it('should initialize without error', () => {
      expect(service).toBeDefined();
    });

    it('should report Redis as unavailable', () => {
      expect(service.isAvailable()).toBe(false);
    });

    it('should return healthy status for any queue when no connection', async () => {
      const health = await service.getQueueHealth('notifications');
      expect(health.isHealthy).toBe(true);
      expect(health.waiting).toBe(0);
      expect(health.active).toBe(0);
    });

    it('should return health for all queues', async () => {
      const allHealth = await service.getAllQueueHealth();
      expect(allHealth.length).toBeGreaterThan(0);
      allHealth.forEach((h) => {
        expect(h.queueName).toBeDefined();
        expect(h.isHealthy).toBe(true);
      });
    });
  });

  describe('moveToDLQ', () => {
    it('should handle null job gracefully', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [QueueHealthService],
      }).compile();

      service = module.get<QueueHealthService>(QueueHealthService);
      // Should not throw
      await expect(service.moveToDLQ('test', undefined as any)).resolves.toBeUndefined();
    });
  });

  describe('onModuleDestroy', () => {
    it('should shutdown cleanly without connection', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [QueueHealthService],
      }).compile();

      service = module.get<QueueHealthService>(QueueHealthService);
      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    });
  });
});
