import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { Worker } from 'bullmq';
import { AppModule } from './app.module';
import { SecretsManagerService } from './common/secrets/secrets-manager.service';
import { QUEUE_NAMES, WORKER_CONFIG, getRedisUrl, isRedisConfigured } from './common/queue/queue.constants';
import IORedis from 'ioredis';
import { EmailService } from './notification/email/email.service';
import { SmsService } from './notification/sms/sms.service';
import { DeviceTokenService } from './device-token/device-token.service';
import { WebhookService } from './webhook/webhook.service';
import { KdsGateway } from './kds/kds.gateway';

/**
 * DOC-010 §9.4 — Standalone Worker Process
 *
 * Bootstraps a NestJS application context (without HTTP server) to process
 * BullMQ jobs. Run via: `pnpm --filter @zayjar/api run start:worker`
 *
 * The worker process:
 * - Initializes secrets, modules, and all services
 * - Creates BullMQ workers for each queue
 * - Handles graceful shutdown on SIGTERM/SIGINT
 * - Falls back gracefully if Redis is unavailable
 */

const logger = new Logger('Worker');

async function bootstrapWorker(): Promise<void> {
  logger.log('Starting Eleva worker process...');

  // DOC-006 §5.9: Load secrets before module initialization
  const secretsService = new SecretsManagerService();
  await secretsService.loadSecrets();

  // Create NestJS application context (no HTTP server)
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.enableShutdownHooks();

  if (!isRedisConfigured()) {
    logger.warn('REDIS_URL not configured — worker has nothing to process. Exiting.');
    await app.close();
    process.exit(0);
  }

  const redisUrl = getRedisUrl();
  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  // Import services from the NestJS context
  const emailService = app.get(EmailService);
  const smsService = app.get(SmsService);
  const deviceTokenService = app.get(DeviceTokenService);
  const webhookService = app.get(WebhookService);
  const kdsGateway = app.get(KdsGateway);

  const workers: Worker[] = [];

  // DOC-010 §9.4 — Notification dispatch worker
  const notifConfig = WORKER_CONFIG[QUEUE_NAMES.NOTIFICATIONS];
  const notifWorker = new Worker(
    QUEUE_NAMES.NOTIFICATIONS,
    async (job) => {
      const { channel, event, payload, tenantId } = job.data;
      logger.log(`Processing notification job ${job.id}: ${channel}/${event} tenant ${tenantId}`);
      return processChannel(channel, event, payload, tenantId, {
        emailService,
        smsService,
        deviceTokenService,
        webhookService,
        kdsGateway,
      });
    },
    {
      connection,
      concurrency: notifConfig.concurrency,
      limiter: notifConfig.limiter,
    },
  );

  notifWorker.on('completed', (job) => {
    logger.log(`Notification job ${job.id} completed`);
  });

  notifWorker.on('failed', (job, err) => {
    logger.error(`Notification job ${job?.id} failed: ${err.message}`);
  });

  workers.push(notifWorker);
  logger.log(`Notification worker started (concurrency: ${notifConfig.concurrency})`);

  // DOC-010 §9.4 — Webhook delivery worker
  const webhookConfig = WORKER_CONFIG[QUEUE_NAMES.WEBHOOK_DELIVERY];
  const webhookWorker = new Worker(
    QUEUE_NAMES.WEBHOOK_DELIVERY,
    async (job) => {
      const { tenantId, event, payload } = job.data;
      logger.log(`Processing webhook job ${job.id}: ${event} tenant ${tenantId}`);
      const results = await webhookService.dispatchEvent(tenantId, event, payload);
      return { dispatched: results.length, successful: results.filter((r) => r.success).length };
    },
    {
      connection,
      concurrency: webhookConfig.concurrency,
      limiter: webhookConfig.limiter,
    },
  );

  webhookWorker.on('completed', (job) => {
    logger.log(`Webhook job ${job.id} completed`);
  });

  webhookWorker.on('failed', (job, err) => {
    logger.error(`Webhook job ${job?.id} failed: ${err.message}`);
  });

  workers.push(webhookWorker);
  logger.log(`Webhook worker started (concurrency: ${webhookConfig.concurrency})`);

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.log(`Received ${signal}, shutting down workers...`);
    for (const worker of workers) {
      await worker.close();
    }
    await connection.quit();
    await app.close();
    logger.log('Worker process shut down gracefully');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  logger.log('Worker process started. Waiting for jobs...');
}

// Channel processing logic (mirrors DispatchService.processChannel)
async function processChannel(
  channel: string,
  event: string,
  payload: Record<string, unknown>,
  tenantId: string,
  services: {
    emailService: EmailService;
    smsService: SmsService;
    deviceTokenService: DeviceTokenService;
    webhookService: WebhookService;
    kdsGateway: KdsGateway;
  },
): Promise<{ success: boolean; provider?: string }> {
  switch (channel) {
    case 'email': {
      const emailTo = (payload.email || payload.customerEmail || 'customer@example.com') as string;
      const template = event.includes('invoice')
        ? 'invoice'
        : event.includes('order')
          ? 'order-status'
          : 'welcome';
      const result = await services.emailService.sendEmail(emailTo, template, payload);
      return { success: result.success, provider: 'sendgrid' };
    }

    case 'sms': {
      const phone = (payload.phone || payload.customerPhone || '+12025550144') as string;
      const smsMessage = (payload.message || `Eleva: Event ${event} for order ${payload.orderNumber || payload.id || ''}`) as string;
      const result = await services.smsService.sendSms(phone, smsMessage, tenantId);
      return { success: result.success, provider: result.provider };
    }

    case 'push': {
      const userId = (payload.userId || payload.customerId) as string | undefined;
      const title = (payload.title || `Eleva: ${event}`) as string;
      const body = (payload.body || payload.message || `Event ${event} occurred`) as string;
      if (!userId) {
        return { success: false, provider: 'fcm' };
      }
      const result = await services.deviceTokenService.sendPushNotification(tenantId, userId, title, body, payload);
      return { success: result.sent > 0, provider: 'fcm' };
    }

    case 'webhook': {
      const results = await services.webhookService.dispatchEvent(tenantId, event, payload);
      const successCount = results.filter((r) => r.success).length;
      return { success: successCount > 0 || results.length > 0, provider: 'webhook' };
    }

    case 'websocket': {
      const branchId = payload.branchId as string | undefined;
      if (!branchId) {
        return { success: false, provider: 'socket.io' };
      }
      services.kdsGateway.broadcastOrderEvent(tenantId, branchId, event, payload);
      return { success: true, provider: 'socket.io' };
    }

    default:
      return { success: false };
  }
}

bootstrapWorker().catch((err) => {
  logger.error(`Worker bootstrap failed: ${err.message}`, err.stack);
  process.exit(1);
});
