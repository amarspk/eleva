import { Controller, Post, Get, Body, Param, Req, UseGuards, HttpCode, HttpStatus, ForbiddenException, Headers } from '@nestjs/common';
import { WalletService, VerifyPaymentResult, WalletPaymentResult } from './wallet.service';
import { CreateWalletPaymentRequestDto } from './dto/create-wallet-payment-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { AuthenticatedRequest } from '../common/types/request.types';

@Controller('api/v1/payments')
@UseGuards(JwtAuthGuard, RbacPermissionGuard)
export class PaymentController {
  constructor(private readonly walletService: WalletService) {}

  /**
   * POST /api/v1/payments/wallet
   * Creates regional wallet payment session per DOC-009 8.3
   * Supports Apple Pay, Google Pay via Stripe, and KNET, Benefit, Mada via Tap Payments
   * Tenant isolation via JWT tenantId.
   * AUDIT-002 Finding #5 (RBAC): requires the `payment:create` permission
   * (OWNER / MANAGER / CASHIER; KITCHEN_STAFF is denied).
   */
  @RequirePermission('create', 'Payment')
  @Post('wallet')
  @HttpCode(HttpStatus.CREATED)
  async createWalletPayment(
    @Body() dto: CreateWalletPaymentRequestDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<WalletPaymentResult> {
    const user = req.user;
    if (!user?.tenantId) {
      throw new ForbiddenException('Tenant context missing');
    }
    const userId = user.id;
    return this.walletService.createWalletPayment(dto, user.tenantId, userId);
  }

  /**
   * GET /api/v1/payments/wallet/:paymentId/verify
   *
   * Verifies a payment against the PROVIDER and reconciles the stored record.
   * An id unknown to this tenant returns 404 — it is never reported as
   * settled (AUDIT-002).
   * AUDIT-002 Finding #5 (RBAC): requires the `payment:read` permission
   * (OWNER / MANAGER / CASHIER; KITCHEN_STAFF is denied). Tenant ownership
   * of the payment is enforced in WalletService via dbTenantContext.
   */
  @RequirePermission('read', 'Payment')
  @Get('wallet/:paymentId/verify')
  @HttpCode(HttpStatus.OK)
  async verifyPayment(
    @Param('paymentId') paymentId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<VerifyPaymentResult> {
    const user = req.user;
    if (!user?.tenantId) {
      throw new ForbiddenException('Tenant context missing');
    }
    return this.walletService.verifyPayment(paymentId, user.tenantId);
  }

  /**
   * POST /api/v1/payments/webhooks/tap
   * Tap Payments webhook (KNET / Benefit / Mada charge events).
   * Public: Tap cannot present a JWT. The official `hashstring` HMAC-SHA256
   * header is verified inside WalletService BEFORE any state change
   * (AUDIT-002 Finding #2); the tenant is resolved from verified
   * metadata.udf1 only.
   */
  @Public()
  @Post('webhooks/tap')
  @HttpCode(HttpStatus.OK)
  async handleTapWebhook(
    @Body() body: Record<string, unknown>,
    @Headers('hashstring') hashstring?: string,
  ): Promise<{ received: boolean }> {
    return this.walletService.handleTapWebhook(body, hashstring);
  }
}
