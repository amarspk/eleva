import {
  QUEUE_NAMES,
  RETRY_CONFIG,
  JOB_PRIORITY,
  mapPriorityToNumber,
  getRedisUrl,
  isRedisConfigured,
  DLQ_CONFIG,
  WORKER_CONFIG,
} from './queue.constants';

describe('Queue Constants — DOC-010 §9.4', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('QUEUE_NAMES', () => {
    it('should define required queue names per spec', () => {
      expect(QUEUE_NAMES.NOTIFICATIONS).toBe('notifications');
      expect(QUEUE_NAMES.WEBHOOK_DELIVERY).toBe('webhook-delivery');
      expect(QUEUE_NAMES.IMAGE_OPTIMIZATION).toBe('image-optimization');
      expect(QUEUE_NAMES.DLQ).toBe('dead-letter-queue');
    });
  });

  describe('RETRY_CONFIG', () => {
    it('should have 3 attempts per spec (DOC-010 §9.4)', () => {
      expect(RETRY_CONFIG.attempts).toBe(3);
    });

    it('should use exponential backoff starting at 1s', () => {
      expect(RETRY_CONFIG.backoff.type).toBe('exponential');
      expect(RETRY_CONFIG.backoff.delay).toBe(1000);
    });

    it('should clean up completed/failed jobs', () => {
      expect(RETRY_CONFIG.removeOnComplete).toBe(100);
      expect(RETRY_CONFIG.removeOnFail).toBe(50);
    });
  });

  describe('JOB_PRIORITY', () => {
    it('should map priority levels correctly', () => {
      expect(JOB_PRIORITY.HIGH).toBe(1);
      expect(JOB_PRIORITY.NORMAL).toBe(5);
      expect(JOB_PRIORITY.LOW).toBe(10);
    });
  });

  describe('mapPriorityToNumber', () => {
    it('should map high to 1', () => {
      expect(mapPriorityToNumber('high')).toBe(1);
    });

    it('should map normal to 5', () => {
      expect(mapPriorityToNumber('normal')).toBe(5);
    });

    it('should map low to 10', () => {
      expect(mapPriorityToNumber('low')).toBe(10);
    });
  });

  describe('WORKER_CONFIG', () => {
    it('should have concurrency settings for all queues', () => {
      expect(WORKER_CONFIG[QUEUE_NAMES.NOTIFICATIONS].concurrency).toBe(10);
      expect(WORKER_CONFIG[QUEUE_NAMES.WEBHOOK_DELIVERY].concurrency).toBe(5);
      expect(WORKER_CONFIG[QUEUE_NAMES.IMAGE_OPTIMIZATION].concurrency).toBe(3);
    });

    it('should have rate limiters for all queues', () => {
      expect(WORKER_CONFIG[QUEUE_NAMES.NOTIFICATIONS].limiter.max).toBe(100);
      expect(WORKER_CONFIG[QUEUE_NAMES.WEBHOOK_DELIVERY].limiter.max).toBe(50);
      expect(WORKER_CONFIG[QUEUE_NAMES.IMAGE_OPTIMIZATION].limiter.max).toBe(20);
    });
  });

  describe('DLQ_CONFIG', () => {
    it('should have 7-day retention', () => {
      expect(DLQ_CONFIG.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('should have max 1000 entries', () => {
      expect(DLQ_CONFIG.maxCount).toBe(1000);
    });
  });

  describe('getRedisUrl', () => {
    it('should return REDIS_URL from environment', () => {
      process.env.REDIS_URL = 'redis://custom:6379';
      expect(getRedisUrl()).toBe('redis://custom:6379');
    });

    it('should default to localhost:6379', () => {
      delete process.env.REDIS_URL;
      expect(getRedisUrl()).toBe('redis://localhost:6379');
    });
  });

  describe('isRedisConfigured', () => {
    it('should return true when REDIS_URL is set', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      expect(isRedisConfigured()).toBe(true);
    });

    it('should return false when REDIS_URL is not set', () => {
      delete process.env.REDIS_URL;
      expect(isRedisConfigured()).toBe(false);
    });
  });
});
