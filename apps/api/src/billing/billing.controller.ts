import { Controller, Post, Body, Req, UseGuards, HttpCode, HttpStatus, ForbiddenException, Headers } from '@nestjs/common';
import { BillingService } from './billing.service';
import { CreateBillingSessionRequestDto } from './dto/create-billing-session-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { AuthenticatedRequest } from '../common/types/request.types';

@Controller('api/v1/billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  /**
   * POST /api/v1/billing/subscriptions/create-session
   * Per DOC-003 3.9.1
   * Auth: Bearer, Permission: billing:write (RESTAURANT_OWNER only)
   * Tenant isolation: tenantId from JWT, never from client
   */
  @Post('subscriptions/create-session')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async createSession(@Body() dto: CreateBillingSessionRequestDto, @Req() req: AuthenticatedRequest): Promise<{
    checkoutSessionId: string;
    stripeCheckoutUrl: string;
  }> {
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const tenantId = user.tenantId;
    const userId = user.id || user.sub;
    const roles = user.roles || [];

    // Enforce RESTAURANT_OWNER role for billing:write per spec
    if (!roles.includes('RESTAURANT_OWNER') && !roles.includes('PLATFORM_OWNER')) {
      throw new ForbiddenException('Access Denied: billing:write permission requires RESTAURANT_OWNER role');
    }

    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing from authenticated request');
    }

    return this.billingService.createCheckoutSession(dto, tenantId, userId);
  }

  /**
   * POST /api/v1/billing/webhooks
   * Stripe webhook handler per DOC-009 8.2 Billing Sync Automation
   * Public (Stripe cannot provide JWT), verifies signature via STRIPE_WEBHOOK_SECRET
   * Updates tenant and subscription statuses based on event type
   */
  @Public()
  @Post('webhooks')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Req() req: AuthenticatedRequest, @Headers('stripe-signature') signature?: string): Promise<{ received: boolean; action?: string; eventType?: string; eventId?: string; tenantId?: string | null; newSubscriptionStatus?: string | null; newTenantStatus?: string | null }> {
    const rawBody: Buffer | undefined = (req as Record<string, unknown>).rawBody as Buffer | undefined;
    if (!rawBody) {
      return { received: true, action: 'missing_raw_body' };
    }

    const event = this.billingService.verifyWebhookSignature(rawBody, signature);
    const stripeEvent = event.type ? event : event;

    const result = await this.billingService.handleStripeWebhook(stripeEvent);
    return result;
  }
}
