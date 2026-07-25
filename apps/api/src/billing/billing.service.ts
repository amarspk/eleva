import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateBillingSessionRequestDto } from './dto/create-billing-session-request.dto';
import { prisma } from '@zayjar/db';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  /**
   * Creates a Stripe Checkout Session for subscription onboarding or plan upgrade.
   * Per DOC-003 3.9.1
   * Tenant isolation: plan must exist, tenant context validated.
   * If STRIPE_SECRET_KEY not configured, returns mock session for dev/test.
   */
  async createCheckoutSession(dto: CreateBillingSessionRequestDto, tenantId: string, userId: string) {
    this.logger.log(`Creating Stripe checkout session for tenant [${tenantId}] plan [${dto.planId}] user [${userId}]`);

    // Validate plan exists
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: dto.planId },
    });

    if (!plan) {
      throw new NotFoundException(`Subscription plan with ID [${dto.planId}] not found.`);
    }

    // Validate tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID [${tenantId}] not found.`);
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    // If Stripe key not present, return mock session (for dev, test, CI)
    if (!stripeSecretKey) {
      this.logger.warn('STRIPE_SECRET_KEY not configured, returning mock checkout session');
      const mockSessionId = `cs_test_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
      const mockUrl = `https://checkout.stripe.com/c/pay/${mockSessionId}`;

      return {
        checkoutSessionId: mockSessionId,
        stripeCheckoutUrl: mockUrl,
      };
    }

    // Real Stripe integration
    try {
      // Dynamic import to avoid hard dependency if not installed
      const Stripe = require('stripe');
      const stripe = new Stripe(stripeSecretKey, {
        apiVersion: '2023-10-16',
      });

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: (tenant as any).stripeCustomerId || undefined,
        line_items: [
          {
            price: plan.stripePriceId,
            quantity: 1,
          },
        ],
        success_url: dto.successUrl,
        cancel_url: dto.cancelUrl,
        metadata: {
          tenantId,
          planId: dto.planId,
          userId,
        },
      });

      return {
        checkoutSessionId: session.id,
        stripeCheckoutUrl: session.url,
      };
    } catch (err) {
      this.logger.error(`Stripe checkout session creation failed: ${(err as Error).message}`);
      throw new BadRequestException(`Failed to create Stripe checkout session: ${(err as Error).message}`);
    }
  }

  /**
   * Handles Stripe webhook events per DOC-009 8.2 and DOC-004/005 Billing Sync Automation
   * Events: invoice.payment_succeeded, invoice.payment_failed, customer.subscription.deleted, customer.subscription.updated
   * Updates tenant and subscription statuses accordingly
   */
  async handleStripeWebhook(event: any) {
    const eventType = event.type;
    const dataObject = event.data?.object;

    this.logger.log(`Received Stripe webhook event: ${eventType}`);

    if (!dataObject) {
      throw new BadRequestException('Invalid Stripe webhook payload: missing data.object');
    }

    // Map Stripe subscription/customer IDs to internal tenant
    let tenantId: string | null = null;
    let stripeSubscriptionId: string | null = null;
    let stripeCustomerId: string | null = null;

    // Extract IDs based on event type
    if (dataObject.object === 'subscription') {
      stripeSubscriptionId = dataObject.id;
      stripeCustomerId = dataObject.customer;
    } else if (dataObject.object === 'invoice') {
      stripeSubscriptionId = dataObject.subscription;
      stripeCustomerId = dataObject.customer;
    } else if (dataObject.customer) {
      stripeCustomerId = dataObject.customer;
      stripeSubscriptionId = dataObject.subscription || dataObject.id;
    }

    // Find tenant by stripe IDs
    if (stripeCustomerId) {
      const tenant = await prisma.tenant.findFirst({
        where: { stripeCustomerId },
      });
      if (tenant) {tenantId = tenant.id;}
    }

    if (!tenantId && stripeSubscriptionId) {
      const subscription = await prisma.subscription.findFirst({
        where: { stripeSubscriptionId },
      });
      if (subscription) {tenantId = subscription.tenantId;}
    }

    // Fallback: try to get tenantId from metadata
    if (!tenantId && dataObject.metadata?.tenantId) {
      tenantId = dataObject.metadata.tenantId;
    }

    // For test environments without real Stripe IDs, allow test tenantId from metadata or use event's tenantId for mock
    if (!tenantId) {
      this.logger.warn(`Could not resolve tenant for Stripe event ${eventType}, using mock handling`);
      return {
        received: true,
        eventType,
        tenantId: null,
        action: 'no_tenant_resolved',
      };
    }

    // Determine new statuses based on event type
    let newSubscriptionStatus: string | null = null;
    let newTenantStatus: string | null = null;

    switch (eventType) {
      case 'invoice.payment_succeeded':
        newSubscriptionStatus = 'ACTIVE';
        newTenantStatus = 'ACTIVE';
        break;
      case 'invoice.payment_failed':
        newSubscriptionStatus = 'PAST_DUE';
        newTenantStatus = 'PAST_DUE';
        break;
      case 'customer.subscription.deleted':
        newSubscriptionStatus = 'CANCELED';
        newTenantStatus = 'CANCELED';
        break;
      case 'customer.subscription.updated': {
        const stripeStatus = dataObject.status;
        if (stripeStatus === 'active') {
          newSubscriptionStatus = 'ACTIVE';
          newTenantStatus = 'ACTIVE';
        } else if (stripeStatus === 'past_due') {
          newSubscriptionStatus = 'PAST_DUE';
          newTenantStatus = 'PAST_DUE';
        } else if (stripeStatus === 'unpaid') {
          newSubscriptionStatus = 'UNPAID';
          newTenantStatus = 'UNPAID';
        } else if (stripeStatus === 'canceled') {
          newSubscriptionStatus = 'CANCELED';
          newTenantStatus = 'CANCELED';
        }
        break;
      }
      default:
        this.logger.log(`Unhandled Stripe event type: ${eventType}, ignoring`);
        return { received: true, eventType, tenantId, action: 'ignored' };
    }

    // Update subscription and tenant statuses atomically if we have new statuses
    if (newSubscriptionStatus && newTenantStatus) {
      try {
        await prisma.$transaction(async (tx: any) => {
          if (stripeSubscriptionId) {
            await tx.subscription.updateMany({
              where: { stripeSubscriptionId },
              data: { status: newSubscriptionStatus },
            });
          } else if (tenantId) {
            await tx.subscription.updateMany({
              where: { tenantId },
              data: { status: newSubscriptionStatus },
            });
          }

          await tx.tenant.update({
            where: { id: tenantId },
            data: { status: newTenantStatus },
          });
        });

        this.logger.log(
          `Updated tenant [${tenantId}] to status [${newTenantStatus}] and subscription to [${newSubscriptionStatus}] for event [${eventType}]`,
        );
      } catch (err) {
        this.logger.error(`Failed to update tenant/subscription for event ${eventType}: ${(err as Error).message}`);
      }
    }

    return {
      received: true,
      eventType,
      tenantId,
      newSubscriptionStatus,
      newTenantStatus,
    };
  }

  /**
   * Verifies Stripe webhook signature if STRIPE_WEBHOOK_SECRET configured
   * Returns event payload or throws BadRequestException
   */
  verifyWebhookSignature(rawBody: string | Buffer, signature: string | undefined): any {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      this.logger.warn('STRIPE_WEBHOOK_SECRET not configured, skipping signature verification (dev mode)');
      try {
        if (typeof rawBody === 'string') {return JSON.parse(rawBody);}
        return JSON.parse(rawBody.toString());
      } catch {
        return rawBody;
      }
    }

    if (!signature) {
      throw new BadRequestException('Missing Stripe signature header');
    }

    try {
      const Stripe = require('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
        apiVersion: '2023-10-16',
      });
      const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      return event;
    } catch (err) {
      this.logger.error(`Stripe webhook signature verification failed: ${(err as Error).message}`);
      throw new BadRequestException(`Webhook signature verification failed: ${(err as Error).message}`);
    }
  }
}
