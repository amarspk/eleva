import { Module, Global } from '@nestjs/common';
import { QueueHealthService } from './queue-health.service';

/**
 * DOC-010 §9.4 — QueueModule
 *
 * Global module providing BullMQ connection factory and queue health monitoring.
 * The actual queue/worker instances are created per-service (DispatchService, etc.)
 * to avoid tight coupling. This module provides shared infrastructure.
 */
@Global()
@Module({
  providers: [QueueHealthService],
  exports: [QueueHealthService],
})
export class QueueModule {}
