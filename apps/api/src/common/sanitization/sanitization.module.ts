import { Module } from '@nestjs/common';
import { SanitizationService } from './sanitization.service';

/**
 * DOC-006 §5.4 — Input Sanitization Module
 *
 * Provides the SanitizationService for use in middleware and other modules.
 */
@Module({
  providers: [SanitizationService],
  exports: [SanitizationService],
})
export class SanitizationModule {}
