import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from './billing.service';
import { CacheService } from '../common/cache/cache.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { prisma } from '@zayjar/db';
import { NotFoundException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock-hash'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

describe('BillingService Unit Tests - TSK-2.4 + DOC-009 §8.2', () => {
  let service: BillingService;
  let cacheService: jest.Mocked<CacheService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const mockTenantId = 'tenant-123';
  const mockStripeCustomerId = 'cus_abc123';
  const mockStripeSubscriptionId = 'sub_xyz789';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        {
          provide: CacheService,
          useValue: {
            get: jest.fn().mockResolvedValue(false),
            set: jest.fn().mockResolvedValue(undefined),
            del: jest.fn().mockResolvedValue(undefined),
            isCacheActive: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
    cacheService = module.get(CacheService);
    eventEmitter = module.get(EventEmitter2);
    jest.clearAllMocks();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it('should create mock checkout session when STRIPE_SECRET_KEY not configured', async () => {
    const planId = 'plan-gold';
    const dto = {
      planId,
      successUrl: 'https://gourmet-burgers.zayjar.com/backoffice/settings/billing?status=success',
      cancelUrl: 'https://gourmet-burgers.zayjar.com/backoffice/settings/billing?status=canceled',
    };

    jest.spyOn(prisma.subscriptionPlan, 'findUnique').mockResolvedValue({
      id: planId,
      stripePriceId: 'price_123',
    } as any);

    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({
      id: mockTenantId,
      stripeCustomerId: null,
    } as any);

    const result = await service.createCheckoutSession(dto, mockTenantId, 'user-123');

    expect(result.checkoutSessionId).toBeDefined();
    expect(result.checkoutSessionId).toContain('cs_test_');
    expect(result.stripeCheckoutUrl).toContain('https://checkout.stripe.com/c/pay/');
  });

  it('should throw NotFoundException if plan not found', async () => {
    const dto = {
      planId: 'invalid-plan',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    };

    jest.spyOn(prisma.subscriptionPlan, 'findUnique').mockResolvedValue(null);

    await expect(service.createCheckoutSession(dto, mockTenantId, 'user-123')).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException if tenant not found', async () => {
    const dto = {
      planId: 'plan-gold',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    };

    jest.spyOn(prisma.subscriptionPlan, 'findUnique').mockResolvedValue({
      id: dto.planId,
      stripePriceId: 'price_123',
    } as any);

    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue(null);

    await expect(service.createCheckoutSession(dto, mockTenantId, 'user-123')).rejects.toThrow(NotFoundException);
  });

  it('should preserve tenant isolation by validating tenant existence', async () => {
    const dto = {
      planId: 'plan-1',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    };

    const planSpy = jest.spyOn(prisma.subscriptionPlan, 'findUnique').mockResolvedValue({
      id: 'plan-1',
      stripePriceId: 'price_123',
    } as any);

    const tenantSpy = jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({
      id: mockTenantId,
    } as any);

    const result = await service.createCheckoutSession(dto, mockTenantId, 'user-1');

    expect(planSpy).toHaveBeenCalledWith({ where: { id: dto.planId } });
    expect(tenantSpy).toHaveBeenCalledWith({ where: { id: mockTenantId } });
    expect(result.checkoutSessionId).toBeDefined();
  });

  // ==========================================
  // TSK-3.3 — Stripe Webhook Handling Tests
  // ==========================================
  describe('Stripe Webhook Handling - TSK-3.3', () => {
    it('should handle invoice.payment_succeeded and set ACTIVE', async () => {
      const event = {
        type: 'invoice.payment_succeeded',
        id: 'evt_success_1',
        data: {
          object: {
            object: 'invoice',
            id: 'in_123',
            customer: mockStripeCustomerId,
            subscription: mockStripeSubscriptionId,
            metadata: { tenantId: mockTenantId },
          },
        },
      };

      jest.spyOn(prisma.tenant, 'findFirst').mockResolvedValue({ id: mockTenantId } as any);
      jest.spyOn(prisma.subscription, 'findFirst').mockResolvedValue(null as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) =>
        cb({
          subscription: {
            findFirst: jest.fn().mockResolvedValue({ status: 'TRIALING' }),
            updateMany: jest.fn().mockResolvedValue({}),
          },
          tenant: { update: jest.fn().mockResolvedValue({}) },
        }),
      );

      const result = await service.handleStripeWebhook(event);

      expect(result.received).toBe(true);
      expect(result.eventType).toBe('invoice.payment_succeeded');
      expect(result.newSubscriptionStatus).toBe('ACTIVE');
      expect(result.newTenantStatus).toBe('ACTIVE');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'billing.status_changed',
        expect.objectContaining({
          tenantId: mockTenantId,
          previousStatus: 'TRIALING',
          newStatus: 'ACTIVE',
          eventType: 'invoice.payment_succeeded',
        }),
      );
    });

    it('should handle invoice.payment_failed and set PAST_DUE', async () => {
      const event = {
        type: 'invoice.payment_failed',
        id: 'evt_fail_1',
        data: {
          object: {
            object: 'invoice',
            id: 'in_123',
            customer: mockStripeCustomerId,
            subscription: mockStripeSubscriptionId,
            metadata: { tenantId: mockTenantId },
          },
        },
      };

      jest.spyOn(prisma.tenant, 'findFirst').mockResolvedValue({ id: mockTenantId } as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) =>
        cb({
          subscription: {
            findFirst: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
            updateMany: jest.fn().mockResolvedValue({}),
          },
          tenant: { update: jest.fn().mockResolvedValue({}) },
        }),
      );

      const result = await service.handleStripeWebhook(event);

      expect(result.newSubscriptionStatus).toBe('PAST_DUE');
      expect(result.newTenantStatus).toBe('PAST_DUE');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'billing.status_changed',
        expect.objectContaining({
          previousStatus: 'ACTIVE',
          newStatus: 'PAST_DUE',
        }),
      );
    });

    it('should handle customer.subscription.deleted and set CANCELED', async () => {
      const event = {
        type: 'customer.subscription.deleted',
        id: 'evt_del_1',
        data: {
          object: {
            object: 'subscription',
            id: mockStripeSubscriptionId,
            customer: mockStripeCustomerId,
          },
        },
      };

      jest.spyOn(prisma.tenant, 'findFirst').mockResolvedValue({ id: mockTenantId } as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) =>
        cb({
          subscription: {
            findFirst: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
            updateMany: jest.fn().mockResolvedValue({}),
          },
          tenant: { update: jest.fn().mockResolvedValue({}) },
        }),
      );

      const result = await service.handleStripeWebhook(event);

      expect(result.newSubscriptionStatus).toBe('CANCELED');
      expect(result.newTenantStatus).toBe('CANCELED');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'billing.status_changed',
        expect.objectContaining({
          previousStatus: 'ACTIVE',
          newStatus: 'CANCELED',
        }),
      );
    });

    it('should return no_tenant_resolved when tenant cannot be resolved', async () => {
      const event = {
        type: 'invoice.payment_succeeded',
        id: 'evt_no_resolve',
        data: {
          object: {
            object: 'invoice',
            id: 'in_123',
            customer: 'cus_unknown',
            subscription: 'sub_unknown',
          },
        },
      };

      jest.spyOn(prisma.tenant, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.subscription, 'findFirst').mockResolvedValue(null);

      const result = await service.handleStripeWebhook(event);

      expect(result.received).toBe(true);
      expect(result.action).toBe('no_tenant_resolved');
    });

    it('should verify webhook signature or fallback to JSON parsing in dev mode', () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;
      const rawBody = JSON.stringify({ type: 'invoice.payment_succeeded', data: { object: {} } });
      const result = service.verifyWebhookSignature(rawBody, undefined);
      expect(result.type).toBe('invoice.payment_succeeded');
    });
  });

  // ==========================================
  // DOC-009 §8.2 — Checkout Session Completion
  // ==========================================
  describe('checkout.session.completed - DOC-009 §8.2', () => {
    it('should persist stripeCustomerId and stripeSubscriptionId from checkout session', async () => {
      const event = {
        type: 'checkout.session.completed',
        id: 'evt_checkout_1',
        data: {
          object: {
            object: 'checkout.session',
            customer: mockStripeCustomerId,
            subscription: mockStripeSubscriptionId,
            metadata: { tenantId: mockTenantId },
          },
        },
      };

      jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({
        id: mockTenantId,
        stripeCustomerId: null,
      } as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) =>
        cb({
          tenant: { update: jest.fn().mockResolvedValue({}) },
          subscription: {
            findFirst: jest.fn().mockResolvedValue({ id: 'sub-internal', stripeSubscriptionId: null }),
            update: jest.fn().mockResolvedValue({}),
          },
        }),
      );

      const result = await service.handleStripeWebhook(event);

      expect(result.action).toBe('stripe_ids_persisted');
      expect(result.tenantId).toBe(mockTenantId);
      expect(cacheService.set).toHaveBeenCalledWith(
        'stripe:webhook:evt_checkout_1',
        true,
        30 * 24 * 60 * 60,
      );
    });

    it('should skip when checkout session has no tenantId in metadata', async () => {
      const event = {
        type: 'checkout.session.completed',
        id: 'evt_checkout_2',
        data: {
          object: {
            object: 'checkout.session',
            customer: mockStripeCustomerId,
            subscription: mockStripeSubscriptionId,
            metadata: {},
          },
        },
      };

      const result = await service.handleStripeWebhook(event);

      expect(result.action).toBe('no_tenant_metadata');
    });

    it('should skip when checkout session references non-existent tenant', async () => {
      const event = {
        type: 'checkout.session.completed',
        id: 'evt_checkout_3',
        data: {
          object: {
            object: 'checkout.session',
            customer: mockStripeCustomerId,
            subscription: mockStripeSubscriptionId,
            metadata: { tenantId: 'nonexistent-tenant' },
          },
        },
      };

      jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue(null);

      const result = await service.handleStripeWebhook(event);

      expect(result.action).toBe('tenant_not_found');
    });
  });

  // ==========================================
  // DOC-009 §8.2 — Trial Will End
  // ==========================================
  describe('customer.subscription.trial_will_end - DOC-009 §8.2', () => {
    it('should emit domain event for trial expiry notification', async () => {
      const event = {
        type: 'customer.subscription.trial_will_end',
        id: 'evt_trial_1',
        data: {
          object: {
            object: 'subscription',
            id: mockStripeSubscriptionId,
            customer: mockStripeCustomerId,
          },
        },
      };

      jest.spyOn(prisma.tenant, 'findFirst').mockResolvedValue({ id: mockTenantId } as any);

      const result = await service.handleStripeWebhook(event);

      expect(result.action).toBe('trial_expiry_notification_emitted');
      expect(result.tenantId).toBe(mockTenantId);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'billing.status_changed',
        expect.objectContaining({
          tenantId: mockTenantId,
          eventType: 'customer.subscription.trial_will_end',
          previousStatus: 'TRIALING',
          newStatus: 'TRIALING',
        }),
      );
      expect(cacheService.set).toHaveBeenCalledWith(
        'stripe:webhook:evt_trial_1',
        true,
        30 * 24 * 60 * 60,
      );
    });

    it('should return no_tenant_resolved when trial event cannot resolve tenant', async () => {
      const event = {
        type: 'customer.subscription.trial_will_end',
        id: 'evt_trial_2',
        data: {
          object: {
            object: 'subscription',
            id: 'sub_unknown',
            customer: 'cus_unknown',
          },
        },
      };

      jest.spyOn(prisma.tenant, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.subscription, 'findFirst').mockResolvedValue(null);

      const result = await service.handleStripeWebhook(event);

      expect(result.action).toBe('no_tenant_resolved');
    });
  });

  // ==========================================
  // DOC-009 §8.2 — Period Tracking
  // ==========================================
  describe('customer.subscription.updated period tracking - DOC-009 §8.2', () => {
    it('should update currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd from Stripe data', async () => {
      const periodStart = Math.floor(Date.now() / 1000);
      const periodEnd = periodStart + 30 * 24 * 60 * 60;

      const event = {
        type: 'customer.subscription.updated',
        id: 'evt_updated_1',
        data: {
          object: {
            object: 'subscription',
            id: mockStripeSubscriptionId,
            customer: mockStripeCustomerId,
            status: 'active',
            current_period_start: periodStart,
            current_period_end: periodEnd,
            cancel_at_period_end: true,
            canceled_at: periodEnd,
          },
        },
      };

      jest.spyOn(prisma.tenant, 'findFirst').mockResolvedValue({ id: mockTenantId } as any);

      const updateManyMock = jest.fn().mockResolvedValue({});
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) =>
        cb({
          subscription: {
            findFirst: jest.fn().mockResolvedValue({ status: 'PAST_DUE' }),
            updateMany: updateManyMock,
          },
          tenant: { update: jest.fn().mockResolvedValue({}) },
        }),
      );

      const result = await service.handleStripeWebhook(event);

      expect(result.newSubscriptionStatus).toBe('ACTIVE');
      expect(result.newTenantStatus).toBe('ACTIVE');

      expect(updateManyMock).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: mockStripeSubscriptionId },
        data: expect.objectContaining({
          status: 'ACTIVE',
          currentPeriodStart: new Date(periodStart * 1000),
          currentPeriodEnd: new Date(periodEnd * 1000),
          cancelAtPeriodEnd: true,
          canceledAt: new Date(periodEnd * 1000),
        }),
      });
    });

    it('should update period fields only when present in Stripe data', async () => {
      const event = {
        type: 'customer.subscription.updated',
        id: 'evt_updated_2',
        data: {
          object: {
            object: 'subscription',
            id: mockStripeSubscriptionId,
            customer: mockStripeCustomerId,
            status: 'active',
          },
        },
      };

      jest.spyOn(prisma.tenant, 'findFirst').mockResolvedValue({ id: mockTenantId } as any);

      const updateManyMock = jest.fn().mockResolvedValue({});
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) =>
        cb({
          subscription: {
            findFirst: jest.fn().mockResolvedValue({ status: 'TRIALING' }),
            updateMany: updateManyMock,
          },
          tenant: { update: jest.fn().mockResolvedValue({}) },
        }),
      );

      await service.handleStripeWebhook(event);

      expect(updateManyMock).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: mockStripeSubscriptionId },
        data: { status: 'ACTIVE' },
      });
    });

    it('should map unpaid Stripe status to UNPAID', async () => {
      const event = {
        type: 'customer.subscription.updated',
        id: 'evt_updated_3',
        data: {
          object: {
            object: 'subscription',
            id: mockStripeSubscriptionId,
            customer: mockStripeCustomerId,
            status: 'unpaid',
          },
        },
      };

      jest.spyOn(prisma.tenant, 'findFirst').mockResolvedValue({ id: mockTenantId } as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) =>
        cb({
          subscription: {
            findFirst: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
            updateMany: jest.fn().mockResolvedValue({}),
          },
          tenant: { update: jest.fn().mockResolvedValue({}) },
        }),
      );

      const result = await service.handleStripeWebhook(event);

      expect(result.newSubscriptionStatus).toBe('UNPAID');
      expect(result.newTenantStatus).toBe('UNPAID');
    });
  });

  // ==========================================
  // DOC-009 §8.2 — Idempotency Guard
  // ==========================================
  describe('Idempotency Guard - DOC-009 §8.2', () => {
    it('should skip processing when event ID already exists in cache', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(true);

      const event = {
        type: 'invoice.payment_succeeded',
        id: 'evt_duplicate_1',
        data: {
          object: {
            object: 'invoice',
            id: 'in_123',
            customer: mockStripeCustomerId,
            subscription: mockStripeSubscriptionId,
            metadata: { tenantId: mockTenantId },
          },
        },
      };

      const result = await service.handleStripeWebhook(event);

      expect(result.action).toBe('duplicate');
      expect(result.eventId).toBe('evt_duplicate_1');
      expect(prisma.tenant.findFirst).not.toHaveBeenCalled();
      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('should process new event and store idempotency key after processing', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(false);

      const event = {
        type: 'invoice.payment_succeeded',
        id: 'evt_new_1',
        data: {
          object: {
            object: 'invoice',
            id: 'in_123',
            customer: mockStripeCustomerId,
            subscription: mockStripeSubscriptionId,
            metadata: { tenantId: mockTenantId },
          },
        },
      };

      jest.spyOn(prisma.tenant, 'findFirst').mockResolvedValue({ id: mockTenantId } as any);
      jest.spyOn(prisma.subscription, 'findFirst').mockResolvedValue(null as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) =>
        cb({
          subscription: {
            findFirst: jest.fn().mockResolvedValue({ status: 'TRIALING' }),
            updateMany: jest.fn().mockResolvedValue({}),
          },
          tenant: { update: jest.fn().mockResolvedValue({}) },
        }),
      );

      const result = await service.handleStripeWebhook(event);

      expect(result.received).toBe(true);
      expect(cacheService.set).toHaveBeenCalledWith(
        'stripe:webhook:evt_new_1',
        true,
        30 * 24 * 60 * 60,
      );
    });

    it('should check cache with 30-day TTL (2592000 seconds)', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(false);

      const event = {
        type: 'invoice.payment_succeeded',
        id: 'evt_ttl_check',
        data: {
          object: {
            object: 'invoice',
            id: 'in_123',
            customer: mockStripeCustomerId,
            subscription: mockStripeSubscriptionId,
            metadata: { tenantId: mockTenantId },
          },
        },
      };

      jest.spyOn(prisma.tenant, 'findFirst').mockResolvedValue({ id: mockTenantId } as any);
      jest.spyOn(prisma.subscription, 'findFirst').mockResolvedValue(null as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) =>
        cb({
          subscription: {
            findFirst: jest.fn().mockResolvedValue({ status: 'TRIALING' }),
            updateMany: jest.fn().mockResolvedValue({}),
          },
          tenant: { update: jest.fn().mockResolvedValue({}) },
        }),
      );

      await service.handleStripeWebhook(event);

      expect(cacheService.get).toHaveBeenCalledWith(
        'stripe:webhook:evt_ttl_check',
        expect.any(Function),
        30 * 24 * 60 * 60,
      );
      expect(cacheService.set).toHaveBeenCalledWith(
        'stripe:webhook:evt_ttl_check',
        true,
        30 * 24 * 60 * 60,
      );
    });
  });

  // ==========================================
  // DOC-009 §8.2 — Domain Event Emission
  // ==========================================
  describe('Domain Event Emission - DOC-009 §8.2', () => {
    it('should not emit domain event when no status change occurs (ignored event)', async () => {
      const event = {
        type: 'customer.payment_method.attached',
        id: 'evt_ignored',
        data: {
          object: {
            object: 'payment_method',
            customer: mockStripeCustomerId,
          },
        },
      };

      jest.spyOn(prisma.tenant, 'findFirst').mockResolvedValue({ id: mockTenantId } as any);

      const result = await service.handleStripeWebhook(event);

      expect(result.action).toBe('ignored');
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should emit domain event with correct payload structure', async () => {
      const event = {
        type: 'invoice.payment_failed',
        id: 'evt_emit_check',
        data: {
          object: {
            object: 'invoice',
            id: 'in_123',
            customer: mockStripeCustomerId,
            subscription: mockStripeSubscriptionId,
          },
        },
      };

      jest.spyOn(prisma.tenant, 'findFirst').mockResolvedValue({ id: mockTenantId } as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) =>
        cb({
          subscription: {
            findFirst: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
            updateMany: jest.fn().mockResolvedValue({}),
          },
          tenant: { update: jest.fn().mockResolvedValue({}) },
        }),
      );

      await service.handleStripeWebhook(event);

      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'billing.status_changed',
        expect.objectContaining({
          tenantId: mockTenantId,
          previousStatus: 'ACTIVE',
          newStatus: 'PAST_DUE',
          eventType: 'invoice.payment_failed',
          eventId: 'evt_emit_check',
          timestamp: expect.any(Date),
        }),
      );
    });
  });

  // ==========================================
  // AUDIT-002 Finding #1 — production fail-closed webhook signature
  // ==========================================
  describe('Stripe webhook signature — production fail-closed (AUDIT-002)', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    afterEach(() => {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
      if (originalWebhookSecret === undefined) {
        delete process.env.STRIPE_WEBHOOK_SECRET;
      } else {
        process.env.STRIPE_WEBHOOK_SECRET = originalWebhookSecret;
      }
    });

    it('rejects the webhook when STRIPE_WEBHOOK_SECRET is missing in production (fail closed, 503)', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.STRIPE_WEBHOOK_SECRET;

      const rawBody = JSON.stringify({ type: 'invoice.payment_succeeded', data: { object: {} } });

      expect(() => service.verifyWebhookSignature(rawBody, undefined)).toThrow(ServiceUnavailableException);
    });

    it('rejects the webhook on an invalid signature in production (400, never accepted)', () => {
      process.env.NODE_ENV = 'production';
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret_for_audit002';

      const rawBody = JSON.stringify({ id: 'evt_forged', type: 'invoice.payment_succeeded', data: { object: {} } });

      expect(() => service.verifyWebhookSignature(Buffer.from(rawBody), 't=1,v1=deadbeef')).toThrow(BadRequestException);
    });

    it('accepts a genuinely valid Stripe signature in production (real constructEvent verification)', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Stripe = require('stripe');
      const stripe = new Stripe('sk_test_dummy_key_for_audit002', { apiVersion: '2023-10-16' });
      const secret = 'whsec_test_secret_for_audit002';
      const payload = JSON.stringify({
        id: 'evt_valid_audit002',
        type: 'invoice.payment_succeeded',
        data: { object: { id: 'in_1', customer: 'cus_1', subscription: 'sub_1' } },
      });
      // generateTestHeaderString produces a REAL HMAC signature over the payload
      // with the given secret — constructEvent then verifies it cryptographically.
      const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });

      process.env.NODE_ENV = 'production';
      process.env.STRIPE_WEBHOOK_SECRET = secret;

      const event = service.verifyWebhookSignature(Buffer.from(payload), signature);
      expect(event.id).toBe('evt_valid_audit002');
      expect(event.type).toBe('invoice.payment_succeeded');
    });

    it('preserves the unverified dev/test fallback outside production (missing secret still parses JSON)', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.STRIPE_WEBHOOK_SECRET;

      const rawBody = JSON.stringify({ type: 'invoice.payment_succeeded', data: { object: {} } });
      const result = service.verifyWebhookSignature(rawBody, undefined);
      expect(result.type).toBe('invoice.payment_succeeded');
    });
  });
});
