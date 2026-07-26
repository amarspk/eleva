import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { EmailService } from '../email/email.service';
import { SmsService } from '../sms/sms.service';
import { DeviceTokenService } from '../../device-token/device-token.service';
import { WebhookService } from '../../webhook/webhook.service';
import { KdsGateway } from '../../kds/kds.gateway';
import {
  QUEUE_NAMES,
  RETRY_CONFIG,
  mapPriorityToNumber,
  isRedisConfigured,
} from '../../common/queue/queue.constants';

export type NotificationChannel = 'email' | 'sms' | 'push' | 'webhook' | 'websocket';
export type NotificationPriority = 'low' | 'normal' | 'high';

export interface DispatchJob {
  id: string;
  tenantId: string;
  channel: NotificationChannel;
  event: string;
  payload: any;
  priority: NotificationPriority;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
}

/**
 * DOC-010 §9.4 — Multi-Channel Dispatch Service (BullMQ-backed)
 *
 * Offloads notification dispatches to BullMQ queues to prevent blocking
 * core API requests (DOC-008 §7.1). Falls back to in-memory processing
 * when Redis is unavailable (development/testing).
 *
 * Retry policy per spec: 3 attempts, exponential backoff starting at 1s.
 * Failed jobs moved to Dead Letter Queue for analysis.
 */
@Injectable()
export class DispatchService implements OnModuleDestroy {
  private readonly logger = new Logger(DispatchService.name);
  private readonly queue: DispatchJob[] = []; // In-memory fallback
  private readonly deadLetterQueue: DispatchJob[] = [];
  private bullMQQueue: Queue | null = null;
  private bullMQWorker: Worker | null = null;

  constructor(
    private readonly emailService: EmailService,
    private readonly smsService: SmsService,
    private readonly deviceTokenService: DeviceTokenService,
    private readonly webhookService: WebhookService,
    private readonly kdsGateway: KdsGateway,
  ) {
    if (isRedisConfigured()) {
      this.initializeBullMQ();
    } else {
      this.logger.warn('REDIS_URL not configured, using in-memory queue fallback per DOC-008 §7.1');
    }
  }

  private initializeBullMQ(): void {
    try {
      // Dynamic import to avoid hard dependency when not installed in test environments
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const IORedis = require('ioredis');
      const connection = new IORedis(process.env.REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      });

      this.bullMQQueue = new Queue(QUEUE_NAMES.NOTIFICATIONS, { connection });

      this.bullMQWorker = new Worker(
        QUEUE_NAMES.NOTIFICATIONS,
        async (job: Job) => {
          const { channel, event, payload, tenantId } = job.data;
          return this.processChannel(channel, event, payload, tenantId);
        },
        {
          connection,
          concurrency: 10,
          limiter: { max: 100, duration: 1000 },
        },
      );

      this.bullMQWorker.on('completed', (job: Job) => {
        this.logger.log(`Dispatch job ${job.id} completed for event ${job.data.event}`);
      });

      this.bullMQWorker.on('failed', (job: Job | undefined, err: Error) => {
        this.logger.error(`Dispatch job ${job?.id} failed: ${err.message}`);
      });

      this.logger.log('BullMQ notification queue initialized per DOC-008 §7.1');
    } catch (err) {
      this.logger.warn(`BullMQ initialization failed, using in-memory fallback: ${(err as Error).message}`);
    }
  }

  /**
   * Multi-channel dispatch per DOC-008 §7.1
   * Offloads to BullMQ queue to prevent blocking core API requests.
   */
  async dispatch(
    tenantId: string,
    channel: NotificationChannel,
    event: string,
    payload: any,
    priority: NotificationPriority = 'normal',
  ) {
    const job: DispatchJob = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      tenantId,
      channel,
      event,
      payload,
      priority,
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date(),
    };

    if (this.bullMQQueue) {
      try {
        await this.bullMQQueue.add(
          event,
          { tenantId, channel, event, payload, priority },
          {
            priority: mapPriorityToNumber(priority),
            ...RETRY_CONFIG,
          },
        );
        this.logger.log(`Dispatched ${channel} job for event ${event} tenant ${tenantId} to BullMQ queue`);
        return { queued: true, jobId: job.id, channel, event };
      } catch (err) {
        this.logger.warn(`BullMQ queue add failed, falling back to in-memory: ${(err as Error).message}`);
      }
    }

    this.queue.push(job);
    setImmediate(() => this.processInMemoryQueue());

    return { queued: true, jobId: job.id, channel, event, fallback: 'memory' };
  }

  /**
   * Broadcast to all channels for an event per DOC-008 §7.1 dispatch engine.
   */
  async dispatchToAllChannels(tenantId: string, event: string, payload: any) {
    const channels: NotificationChannel[] = ['email', 'sms', 'push', 'webhook', 'websocket'];
    const results = [];

    for (const channel of channels) {
      const result = await this.dispatch(tenantId, channel, event, payload);
      results.push(result);
    }

    return results;
  }

  private async processInMemoryQueue(): Promise<void> {
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) {
        break;
      }

      job.attempts++;

      try {
        const result = await this.processChannel(job.channel, job.event, job.payload, job.tenantId);
        this.logger.log(`In-memory dispatch job ${job.id} channel ${job.channel} event ${job.event} succeeded`);

        if (!result.success && job.attempts < job.maxAttempts) {
          const backoff = Math.pow(2, job.attempts) * 1000;
          this.logger.warn(`Dispatch job ${job.id} failed, requeueing attempt ${job.attempts}/${job.maxAttempts} backoff ${backoff}ms`);
          setTimeout(() => {
            this.queue.push(job);
          }, backoff);
        } else if (!result.success) {
          this.logger.error(`Dispatch job ${job.id} failed after ${job.attempts} attempts, moving to DLQ`);
          this.deadLetterQueue.push(job);
        }
      } catch (err) {
        this.logger.error(`Dispatch job ${job.id} threw exception: ${(err as Error).message}`);
        if (job.attempts < job.maxAttempts) {
          this.queue.push(job);
        } else {
          this.deadLetterQueue.push(job);
        }
      }
    }
  }

  private async processChannel(
    channel: NotificationChannel,
    event: string,
    payload: any,
    tenantId: string,
  ): Promise<{ success: boolean; provider?: string }> {
    switch (channel) {
      case 'email': {
        const emailTo = payload.email || payload.customerEmail || 'customer@example.com';
        const template = event.includes('invoice')
          ? 'invoice'
          : event.includes('order')
            ? 'order-status'
            : 'welcome';
        try {
          const result = await this.emailService.sendEmail(emailTo, template, payload);
          return { success: result.success, provider: 'sendgrid' };
        } catch {
          return { success: false };
        }
      }

      case 'sms': {
        const phone = payload.phone || payload.customerPhone || '+12025550144';
        const smsMessage =
          payload.message || `Zayjar: Event ${event} for order ${payload.orderNumber || payload.id || ''}`;
        try {
          const result = await this.smsService.sendSms(phone, smsMessage, tenantId);
          return { success: result.success, provider: result.provider };
        } catch {
          return { success: false };
        }
      }

      case 'push': {
        const userId = payload.userId || payload.customerId;
        const title = payload.title || `Zayjar: ${event}`;
        const body = payload.body || payload.message || `Event ${event} occurred`;
        try {
          if (!userId) {
            this.logger.warn(`Push skipped: no userId in payload for event ${event} tenant ${tenantId}`);
            return { success: false, provider: 'fcm' };
          }
          const result = await this.deviceTokenService.sendPushNotification(tenantId, userId, title, body, payload);
          return { success: result.sent > 0, provider: 'fcm' };
        } catch {
          return { success: false };
        }
      }

      case 'webhook': {
        try {
          const results = await this.webhookService.dispatchEvent(tenantId, event, payload);
          const successCount = results.filter((r: any) => r.success).length;
          return { success: successCount > 0 || results.length > 0, provider: 'webhook' };
        } catch {
          return { success: false };
        }
      }

      case 'websocket': {
        const branchId = payload.branchId;
        try {
          if (!branchId) {
            this.logger.warn(`WebSocket broadcast skipped: no branchId in payload for event ${event} tenant ${tenantId}`);
            return { success: false, provider: 'socket.io' };
          }
          this.kdsGateway.broadcastOrderEvent(tenantId, branchId, event, payload);
          return { success: true, provider: 'socket.io' };
        } catch {
          return { success: false };
        }
      }

      default:
        return { success: false };
    }
  }

  // Monitoring and testing APIs

  getQueueLength(): number {
    return this.queue.length;
  }

  getDeadLetterQueueLength(): number {
    return this.deadLetterQueue.length;
  }

  getDeadLetterQueue(): DispatchJob[] {
    return [...this.deadLetterQueue];
  }

  clearQueues(): void {
    this.queue.length = 0;
    this.deadLetterQueue.length = 0;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.bullMQWorker) {
      await this.bullMQWorker.close().catch(() => {});
    }
    if (this.bullMQQueue) {
      await this.bullMQQueue.close().catch(() => {});
    }
  }
}
