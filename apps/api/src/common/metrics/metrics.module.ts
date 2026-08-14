import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

/**
 * AUDIT-023 — observability metrics module.
 *
 * MetricsService is exported so AppModule can bind the HTTP metrics
 * middleware to the same isolated registry that the /metrics controller
 * renders.
 */
@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
