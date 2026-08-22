import { Controller, Get, Put, Body, Req, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { CustomerAuthGuard } from '../customer/guards/customer-auth.guard';
import { PromotionService } from './promotion.service';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import type { AuthenticatedRequest } from '../common/types/request.types';

interface CustomerReq extends Request { customer?: { customerId: string; tenantId: string | null } }

@Controller()
export class PromotionController {
  constructor(private readonly promotionService: PromotionService) {}

  @Get('api/v1/customer/promotions/welcome-offer')
  @UseGuards(CustomerAuthGuard)
  @HttpCode(HttpStatus.OK)
  async checkWelcomeOffer(@Req() req: CustomerReq): Promise<unknown> {
    if (!req.customer) {return { eligible: false };}
    return this.promotionService.checkEligibility(req.customer.customerId);
  }

  @Get('api/v1/backoffice/promotions/welcome-offer')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'Customer')
  @HttpCode(HttpStatus.OK)
  async getStaffConfig(@Req() req: AuthenticatedRequest): Promise<unknown> {
    if (!req.user?.tenantId) {return { error: 'Tenant required.' };}
    return this.promotionService.getConfig(req.user.tenantId) ?? { enabled: false, discountType: 'PERCENTAGE', discountValue: 0, minOrderAmount: 0 };
  }

  @Put('api/v1/backoffice/promotions/welcome-offer')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('update', 'Customer')
  @HttpCode(HttpStatus.OK)
  async upsertStaffConfig(@Req() req: AuthenticatedRequest, @Body() body: {
    enabled: boolean; discountType: string; discountValue: number; minOrderAmount?: number;
  }): Promise<unknown> {
    if (!req.user?.tenantId) {return { error: 'Tenant required.' };}
    return this.promotionService.upsertConfig(req.user.tenantId, body);
  }
}
