import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RateLimitGuard } from '../common/rate-limit/rate-limit.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AuthenticatedRequest } from '../common/types/request.types';
import { ReceiptService } from './receipt.service';

/**
 * Receipt endpoint (Phase 4 P3).
 *
 * `GET /api/v1/orders/:id/receipt` — authenticated staff surface with the
 * same guards + `read Order` permission as the order detail route. Branch
 * restrictions are enforced server-side in ReceiptService.
 */
@Controller('api/v1/orders')
@UseGuards(JwtAuthGuard, RbacPermissionGuard, RateLimitGuard)
export class ReceiptController {
  constructor(private readonly receiptService: ReceiptService) {}

  @Get(':id/receipt')
  @RequirePermission('read', 'Order')
  getReceipt(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<Record<string, unknown>> {
    return this.receiptService.getReceiptData(id, req.user?.branches);
  }
}