import { Controller, Get, Put, Param, Body, Query, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { KdsService } from './kds.service';
import { UpdateCookingStatusRequestDto } from './dto/update-cooking-status-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AuthenticatedRequest } from '../common/types/request.types';

@Controller('api/v1/kds')
@UseGuards(JwtAuthGuard, RbacPermissionGuard)
export class KdsController {
  constructor(private readonly kdsService: KdsService) {}

  /**
   * GET /api/v1/kds/tickets?branchId=xxx
   * Returns active kitchen tickets scoped to tenant and branch.
   * Tenant isolation: tenantId resolved from authenticated user (req.user.tenantId), never from client.
   */
  @Get('tickets')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('read', 'Order')
  async getTickets(@Query('branchId') branchId: string, @Req() req: AuthenticatedRequest): Promise<Array<{
    ticketId: string;
    orderId: string;
    ticketNumber: string;
    priority: string;
    elapsedMinutes: number;
    createdAt: Date;
    orderStatus: string;
    items: Array<{
      orderItemId: string;
      name: string;
      quantity: number;
      size: string | null;
      addons: (string | null)[];
      cookingStatus: string;
    }>;
  }>> {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      throw new Error('Tenant context missing from authenticated request');
    }
    if (!branchId) {
      throw new Error('branchId query param is required');
    }
    return this.kdsService.getTickets(branchId, tenantId);
  }

  /**
   * PUT /api/v1/kds/items/:orderItemId/status
   * Updates cooking status of order item.
   * Tenant isolation enforced via KdsService.
   */
  @Put('items/:orderItemId/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('update', 'Order')
  async updateItemStatus(
    @Param('orderItemId') orderItemId: string,
    @Body() dto: UpdateCookingStatusRequestDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ orderItemId: string; cookingStatus: string; updatedAt: string }> {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      throw new Error('Tenant context missing from authenticated request');
    }
    return this.kdsService.updateCookingStatus(orderItemId, dto.status, tenantId);
  }
}

