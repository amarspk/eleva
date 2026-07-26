// DOC-010 §9.4 — BullMQ Queue Names
export const QUEUE_NAMES = {
  NOTIFICATIONS: 'notifications',
  WEBHOOK_DELIVERY: 'webhook-delivery',
  IMAGE_OPTIMIZATION: 'image-optimization',
  DLQ: 'dead-letter-queue',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// DOC-010 §9.4 — Job Types
export const JOB_TYPES = {
  NOTIFICATION_DISPATCH: 'notification-dispatch',
  WEBHOOK_DISPATCH: 'webhook-dispatch',
  IMAGE_OPTIMIZE: 'image-optimize',
} as const;

// DOC-010 §9.4 — Retry Policy: 3 attempts, exponential backoff starting at 1s
export const RETRY_CONFIG = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
  removeOnComplete: 100,
  removeOnFail: 50,
};

// DOC-010 §9.4 — Priority levels
export const JOB_PRIORITY = {
  HIGH: 1,
  NORMAL: 5,
  LOW: 10,
} as const;

export function mapPriorityToNumber(priority: 'high' | 'normal' | 'low'): number {
  switch (priority) {
    case 'high':
      return JOB_PRIORITY.HIGH;
    case 'low':
      return JOB_PRIORITY.LOW;
    default:
      return JOB_PRIORITY.NORMAL;
  }
}

// Worker concurrency settings per queue
export const WORKER_CONFIG = {
  [QUEUE_NAMES.NOTIFICATIONS]: {
    concurrency: 10,
    limiter: { max: 100, duration: 1000 },
  },
  [QUEUE_NAMES.WEBHOOK_DELIVERY]: {
    concurrency: 5,
    limiter: { max: 50, duration: 1000 },
  },
  [QUEUE_NAMES.IMAGE_OPTIMIZATION]: {
    concurrency: 3,
    limiter: { max: 20, duration: 1000 },
  },
} as const;

// DLQ thresholds — move to DLQ after max attempts
export const DLQ_CONFIG = {
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days retention
  maxCount: 1000,
} as const;

// Redis connection helper
export function getRedisUrl(): string {
  return process.env.REDIS_URL || 'redis://localhost:6379';
}

export function isRedisConfigured(): boolean {
  return !!process.env.REDIS_URL;
}
