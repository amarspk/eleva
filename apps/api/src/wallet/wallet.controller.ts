import { Controller, Post, Get, Body, Param, Req, HttpCode, HttpStatus, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CustomerAuthGuard } from '../customer/guards/customer-auth.guard';
import { WalletService } from './wallet.service';
import type { AuthenticatedRequest } from '../common/types/request.types';

interface CustomerReq extends Request { customer?: { customerId: string; tenantId: string | null } }

@Controller()
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('api/v1/customer/wallet')
  @UseGuards(CustomerAuthGuard)
  @HttpCode(HttpStatus.OK)
  async myWallet(@Req() req: CustomerReq): Promise<unknown> {
    if (!req.customer) {return { error: 'Not authenticated.' };}
    return this.walletService.getMyWallet(req.customer.customerId);
  }

  @Get('api/v1/backoffice/customers/:customerId/wallet')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'Customer')
  @HttpCode(HttpStatus.OK)
  async staffWallet(@Req() req: AuthenticatedRequest, @Param('customerId', ParseUUIDPipe) customerId: string): Promise<unknown> {
    if (!req.user?.tenantId) {return { error: 'Tenant required.' };}
    return this.walletService.getStaffWallet(req.user.tenantId, customerId);
  }

  @Post('api/v1/backoffice/customers/:customerId/wallet/credit')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('update', 'Customer')
  @HttpCode(HttpStatus.OK)
  async staffGrantCredit(
    @Req() req: AuthenticatedRequest,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() body: { amount: number; description?: string },
  ): Promise<unknown> {
    if (!req.user?.tenantId) {return { error: 'Tenant required.' };}
    return this.walletService.grantCredit(req.user.tenantId, customerId, body.amount, body.description);
  }
}
