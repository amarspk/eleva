import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import {
  QUEUE_NAMES,
  QueueName,
  WORKER_CONFIG,
  DLQ_CONFIG,
  getRedisUrl,
  isRedisConfigured,
} from './queue.constants';

export interface QueueHealth {
  queueName: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  isHealthy: boolean;
}

/**
 * DOC-010 §9.4 — Queue Health Service
 *
 * Manages BullMQ connection lifecycle, provides health checks for all queues,
 * and handles DLQ monitoring. Uses ioredis (required by BullMQ) separately
 * from the node-redis client used by CacheService.
 */
@Injectable()
export class QueueHealthService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueHealthService.name);
  private connection: IORedis | null = null;
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Map<string, Worker>();
  private readonly dlqQueue: Queue | null = null;

  constructor() {
    if (isRedisConfigured()) {
      this.connection = this.createConnection();
      this.dlqQueue = this.createQueue(QUEUE_NAMES.DLQ);
      this.logger.log('QueueHealthService initialized with Redis connection');
    } else {
      this.logger.warn('REDIS_URL not configured — BullMQ disabled, using in-memory fallback');
    }
  }

  createConnection(): IORedis {
    if (this.connection) {
      return this.connection;
    }
    this.connection = new IORedis(getRedisUrl(), {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    this.connection.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });
    this.connection.on('connect', () => {
      this.logger.log('Redis connected for BullMQ');
    });
    return this.connection;
  }

  createQueue(name: string): Queue {
    if (!this.connection) {
      this.createConnection();
    }
    const queue = new Queue(name, { connection: this.connection! });
    this.queues.set(name, queue);
    return queue;
  }

  createWorker(
    name: string,
    processor: (job: Job) => Promise<any>,
  ): Worker | null {
    if (!this.connection) {
      this.logger.warn(`Cannot create worker for ${name}: no Redis connection`);
      return null;
    }
    const config = WORKER_CONFIG[name as QueueName] || {
      concurrency: 5,
      limiter: { max: 50, duration: 1000 },
    };

    const worker = new Worker(name, processor, {
      connection: this.connection,
      concurrency: config.concurrency,
      limiter: config.limiter,
    });

    worker.on('completed', (job) => {
      this.logger.debug(`Job ${job.id} completed in queue ${name}`);
    });

    worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed in queue ${name}: ${err.message}`);
      this.moveToDLQ(name, job).catch((dlqErr) => {
        this.logger.error(`Failed to move job to DLQ: ${dlqErr.message}`);
      });
    });

    this.workers.set(name, worker);
    this.logger.log(`Worker created for queue ${name} (concurrency: ${config.concurrency})`);
    return worker;
  }

  async moveToDLQ(sourceQueue: string, job: Job | undefined): Promise<void> {
    if (!job || !this.dlqQueue) {
      return;
    }
    try {
      await this.dlqQueue.add(
        'dlq-entry',
        {
          sourceQueue,
          jobId: job.id,
          jobName: job.name,
          data: job.data,
          failedReason: job.failedReason,
          attemptsMade: job.attemptsMade,
          timestamp: Date.now(),
        },
        {
          removeOnComplete: DLQ_CONFIG.maxCount,
          removeOnFail: DLQ_CONFIG.maxCount,
        },
      );
      this.logger.log(`Job ${job.id} moved to DLQ from queue ${sourceQueue}`);
    } catch (err) {
      this.logger.error(`DLQ write failed for job ${job.id}: ${(err as Error).message}`);
    }
  }

  async getQueueHealth(name: string): Promise<QueueHealth> {
    const queue = this.queues.get(name);
    if (!queue) {
      return {
        queueName: name,
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        isHealthy: true,
      };
    }

    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ]);

    return {
      queueName: name,
      waiting,
      active,
      completed,
      failed,
      isHealthy: failed < 100 && active < 1000,
    };
  }

  async getAllQueueHealth(): Promise<QueueHealth[]> {
    const names = Object.values(QUEUE_NAMES);
    return Promise.all(names.map((name) => this.getQueueHealth(name)));
  }

  isAvailable(): boolean {
    return this.connection !== null && this.connection.status === 'ready';
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down queue infrastructure...');
    const closePromises: Promise<void>[] = [];

    for (const [name, worker] of this.workers) {
      closePromises.push(
        worker.close().catch((err) => {
          this.logger.error(`Error closing worker ${name}: ${err.message}`);
        }),
      );
    }

    for (const [name, queue] of this.queues) {
      closePromises.push(
        queue.close().catch((err) => {
          this.logger.error(`Error closing queue ${name}: ${err.message}`);
        }),
      );
    }

    await Promise.all(closePromises);

    if (this.connection) {
      await this.connection.quit().catch(() => {});
      this.connection = null;
    }

    this.logger.log('Queue infrastructure shut down');
  }
}
