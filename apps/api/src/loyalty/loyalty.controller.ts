import { Controller, Post, Get, Put, Body, Req, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RateLimitGuard } from '../common/rate-limit/rate-limit.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CustomerAuthGuard } from '../customer/guards/customer-auth.guard';
import { LoyaltyService } from './loyalty.service';
import type { AuthenticatedRequest } from '../common/types/request.types';

interface CustomerRequest extends Request {
  customer?: { customerId: string; tenantId: string | null };
}

/**
 * Loyalty — customer self-service and staff management (Phase 4).
 *
 * Customer endpoints use the CustomerAuthGuard (customer JWT type:'customer').
 * Staff endpoints use the standard JwtAuthGuard + RbacPermissionGuard.
 */
@Controller()
@UseGuards(RateLimitGuard)
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  // ── Customer self-service ────────────────────────────────────────

  @Get('api/v1/customer/loyalty/me')
  @UseGuards(CustomerAuthGuard)
  @HttpCode(HttpStatus.OK)
  async myBalance(@Req() req: CustomerRequest): Promise<{ balance: number }> {
    return this.loyaltyService.getBalance(this.cust(req).customerId);
  }

  @Get('api/v1/customer/loyalty/history')
  @UseGuards(CustomerAuthGuard)
  @HttpCode(HttpStatus.OK)
  async myHistory(@Req() req: CustomerRequest): Promise<Array<Record<string, unknown>>> {
    return this.loyaltyService.getHistory(this.cust(req).customerId);
  }

  @Post('api/v1/customer/loyalty/redeem')
  @UseGuards(CustomerAuthGuard)
  @HttpCode(HttpStatus.OK)
  async redeem(@Req() req: CustomerRequest, @Body('points') points: number): Promise<unknown> {
    if (!points || points < 0) {
      return { error: 'A valid positive point amount is required.' };
    }
    return this.loyaltyService.redeem(this.cust(req).customerId, points);
  }

  // ── Staff management (backoffice) ────────────────────────────────

  @Get('api/v1/backoffice/loyalty/rule')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'Customer')
  @HttpCode(HttpStatus.OK)
  async getStaffRule(@Req() req: AuthenticatedRequest): Promise<unknown> {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {return { error: 'Tenant context required.' };}
    const rule = await this.loyaltyService.getRule(tenantId);
    return rule ?? { earnRate: 0, earnMinOrderAmount: 0, minRedeemPoints: 0, redeemRate: 0 };
  }

  @Put('api/v1/backoffice/loyalty/rule')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('update', 'Customer')
  @HttpCode(HttpStatus.OK)
  async upsertStaffRule(
    @Req() req: AuthenticatedRequest,
    @Body() body: { earnRate: number; earnMinOrderAmount?: number; minRedeemPoints?: number; redeemRate: number },
  ): Promise<unknown> {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {return { error: 'Tenant context required.' };}
    return this.loyaltyService.upsertRule(tenantId, body);
  }

  private cust(req: CustomerRequest): { customerId: string } {
    if (!req.customer) {throw new Error('CustomerAuthGuard must run first.');}
    return req.customer;
  }
}