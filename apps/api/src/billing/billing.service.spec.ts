import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from './billing.service';
import { prisma } from '@zayjar/db';
import { NotFoundException } from '@nestjs/common';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock-hash'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

describe('BillingService Unit Tests - TSK-2.4', () => {
  let service: BillingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BillingService],
    }).compile();

    service = module.get<BillingService>(BillingService);
    jest.clearAllMocks();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it('should create mock checkout session when STRIPE_SECRET_KEY not configured', async () => {
    const tenantId = 'tenant-123';
    const userId = 'user-123';
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
      id: tenantId,
      stripeCustomerId: null,
    } as any);

    const result = await service.createCheckoutSession(dto, tenantId, userId);

    expect(result.checkoutSessionId).toBeDefined();
    expect(result.checkoutSessionId).toContain('cs_test_');
    expect(result.stripeCheckoutUrl).toContain('https://checkout.stripe.com/c/pay/');
  });

  it('should throw NotFoundException if plan not found', async () => {
    const tenantId = 'tenant-123';
    const userId = 'user-123';
    const dto = {
      planId: 'invalid-plan',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    };

    jest.spyOn(prisma.subscriptionPlan, 'findUnique').mockResolvedValue(null);

    await expect(service.createCheckoutSession(dto, tenantId, userId)).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException if tenant not found', async () => {
    const tenantId = 'tenant-missing';
    const userId = 'user-123';
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

    await expect(service.createCheckoutSession(dto, tenantId, userId)).rejects.toThrow(NotFoundException);
  });

  it('should preserve tenant isolation by validating tenant existence', async () => {
    const tenantId = 'real-tenant-from-jwt';
    const userId = 'user-1';
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
      id: tenantId,
    } as any);

    const result = await service.createCheckoutSession(dto, tenantId, userId);

    expect(planSpy).toHaveBeenCalledWith({ where: { id: dto.planId } });
    expect(tenantSpy).toHaveBeenCalledWith({ where: { id: tenantId } });
    expect(result.checkoutSessionId).toBeDefined();
  });

  // ==========================================
  // TSK-3.3 - Stripe Webhook Handling Tests
  // ==========================================
  describe('Stripe Webhook Handling - TSK-3.3', () => {
    it('should handle invoice.payment_succeeded and set ACTIVE', async () => {
      const tenantId = 'tenant-123';
      const event = {
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            object: 'invoice',
            id: 'in_123',
            customer: 'cus_123',
            subscription: 'sub_123',
            metadata: { tenantId },
          },
        },
      };

      jest.spyOn(prisma.tenant, 'findFirst').mockResolvedValue({ id: tenantId } as any);
      jest.spyOn(prisma.subscription, 'findFirst').mockResolvedValue(null as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) =>
        cb({
          subscription: { updateMany: jest.fn().mockResolvedValue({}) },
          tenant: { update: jest.fn().mockResolvedValue({}) },
        }),
      );

      const result = await service.handleStripeWebhook(event);

      expect(result.received).toBe(true);
      expect(result.eventType).toBe('invoice.payment_succeeded');
      expect(result.newSubscriptionStatus).toBe('ACTIVE');
      expect(result.newTenantStatus).toBe('ACTIVE');
    });

    it('should handle invoice.payment_failed and set PAST_DUE', async () => {
      const tenantId = 'tenant-123';
      const event = {
        type: 'invoice.payment_failed',
        data: {
          object: {
            object: 'invoice',
            id: 'in_123',
            customer: 'cus_123',
            subscription: 'sub_123',
            metadata: { tenantId },
          },
        },
      };

      jest.spyOn(prisma.tenant, 'findFirst').mockResolvedValue({ id: tenantId } as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) =>
        cb({
          subscription: { updateMany: jest.fn().mockResolvedValue({}) },
          tenant: { update: jest.fn().mockResolvedValue({}) },
        }),
      );

      const result = await service.handleStripeWebhook(event);

      expect(result.newSubscriptionStatus).toBe('PAST_DUE');
      expect(result.newTenantStatus).toBe('PAST_DUE');
    });

    it('should handle customer.subscription.deleted and set CANCELED', async () => {
      const tenantId = 'tenant-123';
      const event = {
        type: 'customer.subscription.deleted',
        data: {
          object: {
            object: 'subscription',
            id: 'sub_123',
            customer: 'cus_123',
          },
        },
      };

      jest.spyOn(prisma.tenant, 'findFirst').mockResolvedValue({ id: tenantId } as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) =>
        cb({
          subscription: { updateMany: jest.fn().mockResolvedValue({}) },
          tenant: { update: jest.fn().mockResolvedValue({}) },
        }),
      );

      const result = await service.handleStripeWebhook(event);

      expect(result.newSubscriptionStatus).toBe('CANCELED');
      expect(result.newTenantStatus).toBe('CANCELED');
    });

    it('should return no_tenant_resolved when tenant cannot be resolved', async () => {
      const event = {
        type: 'invoice.payment_succeeded',
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
});
