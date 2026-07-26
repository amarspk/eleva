import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateBillingSessionRequestDto } from './dto/create-billing-session-request.dto';
import { BillingStatusChangedEvent } from './events/billing-status-changed.event';
import { CacheService } from '../common/cache/cache.service';
import { prisma } from '@zayjar/db';

/**
 * DOC-009 §8.2 — Stripe Subscription Lifecycle Webhook Handler
 *
 * Handles inbound Stripe webhook events and keeps tenant/subscription
 * statuses in sync. Emits BillingStatusChangedEvent domain events for
 * notification dispatch — BillingService has zero knowledge of notification
 * channels (email, SMS, push).
 *
 * Idempotency: Stripe may deliver the same event multiple times. Each
 * event is deduplicated using a 30-day TTL key in Redis via CacheService.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private static readonly IDEMPOTENCY_KEY_PREFIX = 'stripe:webhook:';
  private static readonly IDEMPOTENCY_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Creates a Stripe Checkout Session for subscription onboarding or plan upgrade.
   * Per DOC-004 3.9.1
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
   * DOC-009 §8.2 — Handles Stripe webhook events per DOC-004/005 Billing Sync Automation.
   * Processes: checkout.session.completed, invoice.payment_succeeded,
   * invoice.payment_failed, customer.subscription.created,
   * customer.subscription.updated, customer.subscription.deleted,
   * customer.subscription.trial_will_end.
   *
   * Updates tenant and subscription statuses atomically.
   * Emits BillingStatusChangedEvent domain events for notification dispatch.
   */
  async handleStripeWebhook(event: any) {
    const eventType = event.type;
    const dataObject = event.data?.object;
    const eventId = event.id;

    this.logger.log(`Received Stripe webhook event: ${eventType} [${eventId}]`);

    if (!dataObject) {
      throw new BadRequestException('Invalid Stripe webhook payload: missing data.object');
    }

    // DOC-009 §8.2: 30-day idempotency guard via CacheService.
    // Stripe may redeliver events; we track processed event IDs to prevent duplicate side-effects.
    if (eventId) {
      const idempotencyKey = BillingService.IDEMPOTENCY_KEY_PREFIX + eventId;
      const alreadyProcessed = await this.cacheService.get<boolean>(
        idempotencyKey,
        async () => false,
        BillingService.IDEMPOTENCY_TTL_SECONDS,
      );

      if (alreadyProcessed) {
        this.logger.log(`Duplicate Stripe event [${eventId}] (${eventType}), skipping`);
        return { received: true, eventType, eventId, action: 'duplicate' };
      }
    }

    // Handle checkout.session.completed — persists Stripe IDs back to tenant/subscription
    if (eventType === 'checkout.session.completed') {
      const result = await this.handleCheckoutSessionCompleted(dataObject, eventId);
      return result;
    }

    // Handle customer.subscription.trial_will_end — emits event for notification dispatch
    if (eventType === 'customer.subscription.trial_will_end') {
      const result = await this.handleTrialWillEnd(dataObject, eventId);
      return result;
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
      if (tenant) { tenantId = tenant.id; }
    }

    if (!tenantId && stripeSubscriptionId) {
      const subscription = await prisma.subscription.findFirst({
        where: { stripeSubscriptionId },
      });
      if (subscription) { tenantId = subscription.tenantId; }
    }

    // Fallback: try to get tenantId from metadata
    if (!tenantId && dataObject.metadata?.tenantId) {
      tenantId = dataObject.metadata.tenantId;
    }

    if (!tenantId) {
      this.logger.warn(`Could not resolve tenant for Stripe event ${eventType}, using mock handling`);
      return {
        received: true,
        eventType,
        eventId,
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
        return { received: true, eventType, eventId, tenantId, action: 'ignored' };
    }

    // Update subscription and tenant statuses atomically if we have new statuses
    let previousSubscriptionStatus: string | null = null;
    if (newSubscriptionStatus && newTenantStatus) {
      try {
        await prisma.$transaction(async (tx: any) => {
          // Fetch current subscription status before update for domain event
          if (stripeSubscriptionId) {
            const current = await tx.subscription.findFirst({
              where: { stripeSubscriptionId },
              select: { status: true },
            });
            previousSubscriptionStatus = current?.status || null;

            const updateData: Record<string, any> = { status: newSubscriptionStatus };

            // DOC-009 §8.2: Update billing period and cancellation fields from Stripe data
            if (eventType === 'customer.subscription.updated') {
              if (dataObject.current_period_start) {
                updateData.currentPeriodStart = new Date(dataObject.current_period_start * 1000);
              }
              if (dataObject.current_period_end) {
                updateData.currentPeriodEnd = new Date(dataObject.current_period_end * 1000);
              }
              if (typeof dataObject.cancel_at_period_end === 'boolean') {
                updateData.cancelAtPeriodEnd = dataObject.cancel_at_period_end;
              }
              if (dataObject.canceled_at) {
                updateData.canceledAt = new Date(dataObject.canceled_at * 1000);
              }
            }

            await tx.subscription.updateMany({
              where: { stripeSubscriptionId },
              data: updateData,
            });
          } else if (tenantId) {
            const current = await tx.subscription.findFirst({
              where: { tenantId },
              select: { status: true },
            });
            previousSubscriptionStatus = current?.status || null;

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

        // DOC-009 §8.2: Emit domain event for notification dispatch.
        // BillingService has zero knowledge of notification channels —
        // BillingNotificationListener consumes this event.
        this.eventEmitter.emit(
          'billing.status_changed',
          new BillingStatusChangedEvent(
            tenantId,
            previousSubscriptionStatus || 'UNKNOWN',
            newSubscriptionStatus,
            eventType,
            eventId || '',
            new Date(),
          ),
        );
      } catch (err) {
        this.logger.error(`Failed to update tenant/subscription for event ${eventType}: ${(err as Error).message}`);
      }
    }

    // Mark event as processed for idempotency
    if (eventId) {
      await this.cacheService.set(
        BillingService.IDEMPOTENCY_KEY_PREFIX + eventId,
        true,
        BillingService.IDEMPOTENCY_TTL_SECONDS,
      );
    }

    return {
      received: true,
      eventType,
      eventId,
      tenantId,
      newSubscriptionStatus,
      newTenantStatus,
    };
  }

  /**
   * DOC-009 §8.2: Handles checkout.session.completed events.
   * Persists stripeCustomerId on tenant and stripeSubscriptionId on subscription
   * after a successful Stripe Checkout session.
   */
  private async handleCheckoutSessionCompleted(dataObject: any, eventId?: string) {
    const stripeCustomerId = dataObject.customer as string | null;
    const stripeSubscriptionId = dataObject.subscription as string | null;
    const metadataTenantId = dataObject.metadata?.tenantId as string | null;

    if (!metadataTenantId) {
      this.logger.warn(`checkout.session.completed [${eventId}] has no tenantId in metadata, skipping`);
      return { received: true, eventType: 'checkout.session.completed', eventId, action: 'no_tenant_metadata' };
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: metadataTenantId } });
    if (!tenant) {
      this.logger.warn(`checkout.session.completed [${eventId}] references non-existent tenant [${metadataTenantId}]`);
      return { received: true, eventType: 'checkout.session.completed', eventId, action: 'tenant_not_found' };
    }

    try {
      await prisma.$transaction(async (tx: any) => {
        // Persist stripeCustomerId on tenant if not already set
        if (stripeCustomerId && !tenant.stripeCustomerId) {
          await tx.tenant.update({
            where: { id: metadataTenantId },
            data: { stripeCustomerId },
          });
          this.logger.log(`Persisted stripeCustomerId [${stripeCustomerId}] for tenant [${metadataTenantId}]`);
        }

        // Persist stripeSubscriptionId on subscription
        if (stripeSubscriptionId) {
          const subscription = await tx.subscription.findFirst({
            where: { tenantId: metadataTenantId },
          });

          if (subscription && !subscription.stripeSubscriptionId) {
            await tx.subscription.update({
              where: { id: subscription.id },
              data: { stripeSubscriptionId },
            });
            this.logger.log(`Persisted stripeSubscriptionId [${stripeSubscriptionId}] for tenant [${metadataTenantId}]`);
          }
        }
      });
    } catch (err) {
      this.logger.error(`Failed to persist Stripe IDs from checkout.session.completed: ${(err as Error).message}`);
    }

    // Mark event as processed for idempotency
    if (eventId) {
      await this.cacheService.set(
        BillingService.IDEMPOTENCY_KEY_PREFIX + eventId,
        true,
        BillingService.IDEMPOTENCY_TTL_SECONDS,
      );
    }

    return {
      received: true,
      eventType: 'checkout.session.completed',
      eventId,
      tenantId: metadataTenantId,
      action: 'stripe_ids_persisted',
    };
  }

  /**
   * DOC-009 §8.2: Handles customer.subscription.trial_will_end events.
   * Emits domain event so BillingNotificationListener can dispatch
   * trial expiry reminder notifications.
   */
  private async handleTrialWillEnd(dataObject: any, eventId?: string) {
    const stripeCustomerId = dataObject.customer as string | null;
    const stripeSubscriptionId = dataObject.id as string | null;

    let tenantId: string | null = null;

    if (stripeCustomerId) {
      const tenant = await prisma.tenant.findFirst({ where: { stripeCustomerId } });
      if (tenant) { tenantId = tenant.id; }
    }

    if (!tenantId && stripeSubscriptionId) {
      const subscription = await prisma.subscription.findFirst({ where: { stripeSubscriptionId } });
      if (subscription) { tenantId = subscription.tenantId; }
    }

    if (!tenantId && dataObject.metadata?.tenantId) {
      tenantId = dataObject.metadata.tenantId;
    }

    if (!tenantId) {
      this.logger.warn(`customer.subscription.trial_will_end [${eventId}] could not resolve tenant`);
      return { received: true, eventType: 'customer.subscription.trial_will_end', eventId, action: 'no_tenant_resolved' };
    }

    // Emit domain event for notification dispatch — no status change, just notification trigger
    this.eventEmitter.emit(
      'billing.status_changed',
      new BillingStatusChangedEvent(
        tenantId,
        'TRIALING',
        'TRIALING',
        'customer.subscription.trial_will_end',
        eventId || '',
        new Date(),
      ),
    );

    // Mark event as processed for idempotency
    if (eventId) {
      await this.cacheService.set(
        BillingService.IDEMPOTENCY_KEY_PREFIX + eventId,
        true,
        BillingService.IDEMPOTENCY_TTL_SECONDS,
      );
    }

    this.logger.log(`Trial expiry notification emitted for tenant [${tenantId}] via domain event`);

    return {
      received: true,
      eventType: 'customer.subscription.trial_will_end',
      eventId,
      tenantId,
      action: 'trial_expiry_notification_emitted',
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
