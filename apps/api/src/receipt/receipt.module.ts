import { Module } from '@nestjs/common';
import { ReceiptService } from './receipt.service';
import { ReceiptController } from './receipt.controller';
import { AuthModule } from '../auth/auth.module';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module';

/**
 * Phase 4 P3 — Printing & Receipts.
 *
 * `GET /api/v1/orders/:id/receipt` assembles the server-side receipt data
 * (real order + branding + published receipt design config) for the cashier
 * print flow and the backoffice Receipt Designer preview.
 */
@Module({
  imports: [AuthModule, RateLimitModule],
  controllers: [ReceiptController],
  providers: [ReceiptService],
  exports: [ReceiptService],
})
export class ReceiptModule {}
