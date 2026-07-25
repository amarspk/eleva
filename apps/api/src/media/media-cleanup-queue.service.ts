import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { StorageProvider } from './storage/storage-provider.interface';
import { Inject } from '@nestjs/common';

export interface CleanupJob {
  type: 'REPLACE' | 'DELETE' | 'ROLLBACK';
  storageKeys: string[];
  attempts: number;
  nextRetryAt: number;
}

@Injectable()
export class MediaCleanupQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(MediaCleanupQueueService.name);
  private queue: CleanupJob[] = [];
  private processing = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly MAX_RETRIES = 3;

  constructor(
    @Inject('STORAGE_PROVIDER') private readonly storageProvider: StorageProvider,
  ) {}

  enqueue(job: Omit<CleanupJob, 'attempts' | 'nextRetryAt'>): void {
    this.queue.push({ ...job, attempts: 0, nextRetryAt: Date.now() });
    this.scheduleProcessing();
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  private scheduleProcessing(): void {
    if (this.processing) {
      return;
    }
    if (this.timer) {
      return;
    }
    this.timer = setTimeout(() => this.processQueue(), 100);
  }

  private async processQueue(): Promise<void> {
    this.processing = true;
    this.timer = null;

    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      if (job.nextRetryAt > Date.now()) {
        this.queue.push(job);
        await this.sleep(100);
        continue;
      }

      try {
        const result = await this.storageProvider.deleteBatch(job.storageKeys);

        if (result.failed.length > 0) {
          const failedKeys = result.failed.map((f) => f.key);
          job.attempts++;
          if (job.attempts < this.MAX_RETRIES) {
            const backoff = Math.pow(2, job.attempts) * 1000;
            job.nextRetryAt = Date.now() + backoff;
            job.storageKeys = failedKeys;
            this.queue.push(job);
            this.logger.warn(
              `Cleanup partial failure ${job.attempts}/${this.MAX_RETRIES} for ${job.type}: ` +
              `${result.failed.length}/${job.storageKeys.length} keys failed`,
            );
          } else {
            this.logger.error(
              `[MediaCleanup] Permanently failed after ${this.MAX_RETRIES} retries: ` +
              `type=${job.type} failedKeys=${failedKeys.join(',')}`,
            );
          }
        }
      } catch (err: unknown) {
        const error = err as Error;
        job.attempts++;
        if (job.attempts < this.MAX_RETRIES) {
          const backoff = Math.pow(2, job.attempts) * 1000;
          job.nextRetryAt = Date.now() + backoff;
          this.queue.push(job);
          this.logger.warn(
            `Cleanup retry ${job.attempts}/${this.MAX_RETRIES} for ${job.type}: ${error.message}`,
          );
        } else {
          this.logger.error(
            `[MediaCleanup] Permanently failed after ${this.MAX_RETRIES} retries: ` +
            `type=${job.type} keys=${job.storageKeys.join(',')}`,
          );
        }
      }
    }

    this.processing = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }
}
