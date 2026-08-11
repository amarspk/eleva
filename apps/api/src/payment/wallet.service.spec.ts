import { WalletService } from './wallet.service';
import {
  TenantBranchRepository,
  TenantOrderRepository,
  TenantPaymentRepository,
  TenantRestaurantRepository,
} from '@zayjar/db';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac } from 'crypto';
import { PaymentMethodType } from '@zayjar/types';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock-hash'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

// AUDIT-002 Finding #3: module-level Stripe mock so the Idempotency-Key
// argument on paymentIntents.create can be asserted. The `mock` prefix is
// required for jest.mock factory hoisting.
const mockStripePaymentIntentsCreate = jest.fn().mockResolvedValue({
  id: 'pi_idem_1',
  status: 'requires_payment_method',
  client_secret: 'cs_idem_1',
});

jest.mock('stripe', () =>
  jest.fn().mockReturnValue({
    paymentIntents: {
      create: mockStripePaymentIntentsCreate,
      retrieve: jest.fn().mockResolvedValue({ id: 'pi_idem_1', status: 'succeeded' }),
    },
  }),
);

const TENANT = 'tenant-123';
const USER = 'user-123';
const ORDER_ID = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';

/**
 * AUDIT-002 — real payment implementation.
 *
 * Defects proven live before this work:
 *   1. `verifyPayment('I-JUST-MADE-THIS-UP')` returned
 *      `{status:'succeeded', verified:true}` — a total verification bypass.
 *   2. The `payments` table was never written by application code; the only
 *      row in a provisioned DB came from the seed script.
 *   3. Tap Payments (KNET/Benefit/Mada) returned a fabricated `chg_…` id even
 *      when `TAP_PAYMENTS_SECRET_KEY` was configured.
 *   4. The charged amount was taken from the client-supplied `dto.amount`.
 */
describe('WalletService (AUDIT-002 — real payments)', () => {
  let service: WalletService;
  let orderFindById: jest.SpyInstance;
  let branchFindById: jest.SpyInstance;
  let restaurantFindById: jest.SpyInstance;
  let paymentCreate: jest.SpyInstance;
  let paymentFindMany: jest.SpyInstance;
  let paymentUpdate: jest.SpyInstance;

  const order = { id: ORDER_ID, total: '42.55', tenantId: TENANT, branchId: 'branch-1' };

  beforeEach(() => {
    service = new WalletService();
    jest.restoreAllMocks();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.TAP_PAYMENTS_SECRET_KEY;

    orderFindById = jest
      .spyOn(TenantOrderRepository.prototype, 'findById')
      .mockResolvedValue(order as never);
    // AUDIT-002 Finding #4: default fixture — KWD restaurant reachable via the
    // order's branch (Order → Branch → Restaurant.currency).
    branchFindById = jest
      .spyOn(TenantBranchRepository.prototype, 'findById')
      .mockResolvedValue({ id: 'branch-1', restaurantId: 'rest-1' } as never);
    restaurantFindById = jest
      .spyOn(TenantRestaurantRepository.prototype, 'findById')
      .mockResolvedValue({ id: 'rest-1', currency: 'KWD' } as never);
    paymentCreate = jest
      .spyOn(TenantPaymentRepository.prototype, 'create')
      .mockResolvedValue({ id: 'pay-1' } as never);
    paymentFindMany = jest
      .spyOn(TenantPaymentRepository.prototype, 'findMany')
      .mockResolvedValue([] as never);
    paymentUpdate = jest
      .spyOn(TenantPaymentRepository.prototype, 'update')
      .mockResolvedValue({ id: 'pay-1' } as never);
  });

  const dto = (over: Record<string, unknown> = {}) =>
    ({
      orderId: ORDER_ID,
      paymentMethod: PaymentMethodType.LOCAL_WALLET,
      walletType: 'knet',
      amount: 42.55,
      currency: 'KWD',
      ...over,
    }) as never;

  // ==========================================
  // Defect 1 — verification bypass
  // ==========================================
  describe('verifyPayment', () => {
    it('404s an unknown payment id instead of reporting success', async () => {
      paymentFindMany.mockResolvedValue([] as never);

      await expect(service.verifyPayment('I-JUST-MADE-THIS-UP', TENANT)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('looks the payment up tenant-scoped by provider reference', async () => {
      paymentFindMany.mockResolvedValue([
        { id: 'p1', orderId: ORDER_ID, status: 'PAID', amount: '42.55', transactionReference: 'stripe:pi_1' },
      ] as never);

      await service.verifyPayment('pi_1', TENANT);

      expect(paymentFindMany).toHaveBeenCalledWith({
        transactionReference: { endsWith: ':pi_1' },
      });
    });

    it('reports a terminal PAID record without re-querying the provider', async () => {
      paymentFindMany.mockResolvedValue([
        { id: 'p1', orderId: ORDER_ID, status: 'PAID', amount: '42.55', transactionReference: 'stripe:pi_1' },
      ] as never);

      const result = await service.verifyPayment('pi_1', TENANT);

      expect(result.verified).toBe(true);
      expect(result.status).toBe('PAID');
      // No provider key configured, yet no throw: terminal states short-circuit.
      expect(paymentUpdate).not.toHaveBeenCalled();
    });

    it('does NOT report a PENDING record as verified', async () => {
      paymentFindMany.mockResolvedValue([
        { id: 'p1', orderId: ORDER_ID, status: 'PENDING', amount: '42.55', transactionReference: 'pos:pos_cash_x' },
      ] as never);

      const result = await service.verifyPayment('pos_cash_x', TENANT);

      expect(result.verified).toBe(false);
      expect(result.status).toBe('PENDING');
    });

    it('fails closed (503) when the provider cannot be reached', async () => {
      paymentFindMany.mockResolvedValue([
        { id: 'p1', orderId: ORDER_ID, status: 'PENDING', amount: '42.55', transactionReference: 'stripe:pi_1' },
      ] as never);
      // STRIPE_SECRET_KEY intentionally unset -> unverifiable, must not settle.

      await expect(service.verifyPayment('pi_1', TENANT)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(paymentUpdate).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // Defect 2 — persistence
  // ==========================================
  describe('persistence', () => {
    it('records every payment attempt in the payments table', async () => {
      process.env.TAP_PAYMENTS_SECRET_KEY = 'sk_test_tap';
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({ id: 'chg_real_1', status: 'INITIATED', transaction: { url: 'https://tap/pay' } }),
        } as never);

      await service.createWalletPayment(dto(), TENANT, USER);

      expect(paymentCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: ORDER_ID,
          status: 'PENDING',
          paymentMethod: PaymentMethodType.LOCAL_WALLET,
          transactionReference: 'tap_payments:chg_real_1',
        }),
      );
    });

    it('persists the ORDER total, not the client-supplied amount', async () => {
      process.env.TAP_PAYMENTS_SECRET_KEY = 'sk_test_tap';
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'chg_real_2', status: 'INITIATED' }),
      } as never);

      // Client attempts to pay 0.01 for a 42.55 order.
      const result = await service.createWalletPayment(dto({ amount: 0.01 }), TENANT, USER);

      expect(paymentCreate).toHaveBeenCalledWith(expect.objectContaining({ amount: 42.55 }));
      expect(result.amount).toBe(42.55);
    });
  });

  // ==========================================
  // Defect 3 — no fabricated provider responses
  // ==========================================
  describe('provider configuration', () => {
    it('refuses KNET when Tap is not configured (no fabricated charge)', async () => {
      await expect(service.createWalletPayment(dto(), TENANT, USER)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(paymentCreate).not.toHaveBeenCalled();
    });

    it('refuses Apple Pay when Stripe is not configured', async () => {
      await expect(
        service.createWalletPayment(
          dto({ paymentMethod: PaymentMethodType.APPLE_PAY, walletType: 'apple_pay' }),
          TENANT,
          USER,
        ),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(paymentCreate).not.toHaveBeenCalled();
    });

    it('calls the real Tap API when configured', async () => {
      process.env.TAP_PAYMENTS_SECRET_KEY = 'sk_test_tap';
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'chg_real_3', status: 'INITIATED' }),
      } as never);

      const result = await service.createWalletPayment(dto(), TENANT, USER);

      expect(fetchSpy).toHaveBeenCalled();
      const [url, init] = fetchSpy.mock.calls[0];
      expect(String(url)).toContain('/v2/charges');
      expect((init as RequestInit).method).toBe('POST');
      // The returned id comes from the provider, not from Math.random().
      expect(result.paymentId).toBe('chg_real_3');
      expect(result.paymentId).not.toMatch(/mock/);
    });

    it('surfaces a provider error instead of inventing success', async () => {
      process.env.TAP_PAYMENTS_SECRET_KEY = 'sk_test_tap';
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 402,
        text: async () => '{"errors":[{"code":"declined"}]}',
      } as never);

      await expect(service.createWalletPayment(dto(), TENANT, USER)).rejects.toThrow(
        BadRequestException,
      );
      expect(paymentCreate).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // Tenant isolation / input validation
  // ==========================================
  describe('isolation and validation', () => {
    it('404s an order that does not belong to the tenant', async () => {
      orderFindById.mockResolvedValue(null as never);

      await expect(service.createWalletPayment(dto(), TENANT, USER)).rejects.toThrow(
        NotFoundException,
      );
      expect(paymentCreate).not.toHaveBeenCalled();
    });

    it('rejects an unsupported wallet type', async () => {
      await expect(
        service.createWalletPayment(dto({ walletType: 'dogecoin' }), TENANT, USER),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an order whose total is not payable', async () => {
      orderFindById.mockResolvedValue({ ...order, total: '0' } as never);

      await expect(service.createWalletPayment(dto(), TENANT, USER)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ==========================================
  // Webhook reconciliation
  // ==========================================
  describe('settleFromWebhook', () => {
    it('marks a known payment PAID', async () => {
      paymentFindMany.mockResolvedValue([{ id: 'p1' }] as never);

      await service.settleFromWebhook('chg_real_1', TENANT, true);

      expect(paymentUpdate).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ status: 'PAID' }),
      );
    });

    it('ignores a webhook for an unknown payment without throwing', async () => {
      paymentFindMany.mockResolvedValue([] as never);

      await expect(service.settleFromWebhook('unknown', TENANT, true)).resolves.toBeUndefined();
      expect(paymentUpdate).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // AUDIT-002 Finding #2 — Tap webhook (hashstring)
  // ==========================================
  describe('handleTapWebhook (AUDIT-002 Finding #2)', () => {
    const TAP_SECRET = 'sk_test_audit002_webhook';
    // HMAC-SHA256 over a LITERAL concatenation (official Tap algorithm):
    // x_id{id}x_amount{amount}x_currency{currency}x_gateway_reference{gateway}
    // x_payment_reference{payment}x_status{status}x_created{created}
    // Strings are written out explicitly so a mirrored algorithm bug cannot
    // produce a false pass.
    const hmac = (value: string, secret = TAP_SECRET) =>
      createHmac('sha256', secret).update(value).digest('hex');

    const capturedHash = hmac(
      'x_idchg_audit002_1x_amount42.550x_currencyKWD' +
        'x_gateway_referencekw.knetx_payment_referencechg_audit002_1' +
        'x_statusCAPTUREDx_created1698392202943',
    );
    const failedHash = hmac(
      'x_idchg_audit002_2x_amount42.550x_currencyKWD' +
        'x_gateway_referencekw.knetx_payment_referencechg_audit002_2' +
        'x_statusFAILEDx_created1698392202944',
    );

    const tapPayload = (over: Record<string, unknown> = {}) =>
      ({
        id: 'chg_audit002_1',
        status: 'CAPTURED',
        amount: 42.55,
        currency: 'KWD',
        reference: { gateway: 'kw.knet', payment: 'chg_audit002_1' },
        transaction: { created: '1698392202943' },
        metadata: { udf1: TENANT, udf2: ORDER_ID },
        ...over,
      }) as Record<string, unknown>;

    beforeEach(() => {
      process.env.TAP_PAYMENTS_SECRET_KEY = TAP_SECRET;
    });

    it('settles a CAPTURED webhook with a valid hashstring (PAID)', async () => {
      paymentFindMany.mockResolvedValue([{ id: 'p1' }] as never);
      const settleSpy = jest.spyOn(service, 'settleFromWebhook');

      const result = await service.handleTapWebhook(tapPayload(), capturedHash);

      expect(result.received).toBe(true);
      expect(settleSpy).toHaveBeenCalledWith('chg_audit002_1', TENANT, true);
      expect(paymentUpdate).toHaveBeenCalledWith('p1', expect.objectContaining({ status: 'PAID' }));
    });

    it('rejects a webhook with an invalid hashstring (400, no state change)', async () => {
      paymentFindMany.mockResolvedValue([{ id: 'p1' }] as never);
      const settleSpy = jest.spyOn(service, 'settleFromWebhook');

      await expect(
        service.handleTapWebhook(tapPayload(), 'd'.repeat(64)),
      ).rejects.toThrow(BadRequestException);
      expect(settleSpy).not.toHaveBeenCalled();
      expect(paymentUpdate).not.toHaveBeenCalled();
    });

    it('rejects a webhook without a hashstring header (400)', async () => {
      await expect(service.handleTapWebhook(tapPayload(), undefined)).rejects.toThrow(
        BadRequestException,
      );
      expect(paymentUpdate).not.toHaveBeenCalled();
    });

    it('marks a FAILED webhook settlement as FAILED', async () => {
      paymentFindMany.mockResolvedValue([{ id: 'p2' }] as never);

      const result = await service.handleTapWebhook(
        tapPayload({ id: 'chg_audit002_2', status: 'FAILED', reference: { gateway: 'kw.knet', payment: 'chg_audit002_2' }, transaction: { created: '1698392202944' } }),
        failedHash,
      );

      expect(result.received).toBe(true);
      expect(paymentUpdate).toHaveBeenCalledWith('p2', expect.objectContaining({ status: 'FAILED' }));
    });

    it('ignores an unknown charge id without throwing (200 ack)', async () => {
      paymentFindMany.mockResolvedValue([] as never);

      const result = await service.handleTapWebhook(tapPayload(), capturedHash);

      expect(result.received).toBe(true);
      expect(paymentUpdate).not.toHaveBeenCalled();
    });

    it('resolves the tenant ONLY from metadata.udf1', async () => {
      paymentFindMany.mockResolvedValue([{ id: 'p1' }] as never);
      const settleSpy = jest.spyOn(service, 'settleFromWebhook');

      await service.handleTapWebhook(
        tapPayload({ metadata: { udf1: 'tenant-webhook-456', udf2: ORDER_ID } }),
        capturedHash,
      );

      expect(settleSpy).toHaveBeenCalledWith('chg_audit002_1', 'tenant-webhook-456', true);
    });

    it('does not settle when metadata.udf1 is missing', async () => {
      paymentFindMany.mockResolvedValue([{ id: 'p1' }] as never);
      const settleSpy = jest.spyOn(service, 'settleFromWebhook');

      const result = await service.handleTapWebhook(tapPayload({ metadata: undefined }), capturedHash);

      expect(result.received).toBe(true);
      expect(settleSpy).not.toHaveBeenCalled();
      expect(paymentUpdate).not.toHaveBeenCalled();
    });

    it('accepts a hash computed with ISO 3-decimal rounding (KWD)', async () => {
      paymentFindMany.mockResolvedValue([{ id: 'p1' }] as never);

      // amount 42.55, KWD -> must be hashed as "42.550" (3 decimals).
      const result = await service.handleTapWebhook(tapPayload(), capturedHash);
      expect(result.received).toBe(true);
    });

    it('rejects a hash computed with 2-decimal rounding for KWD', async () => {
      const twoDecimalHash = hmac(
        'x_idchg_audit002_1x_amount42.55x_currencyKWD' +
          'x_gateway_referencekw.knetx_payment_referencechg_audit002_1' +
          'x_statusCAPTUREDx_created1698392202943',
      );

      await expect(service.handleTapWebhook(tapPayload(), twoDecimalHash)).rejects.toThrow(
        BadRequestException,
      );
      expect(paymentUpdate).not.toHaveBeenCalled();
    });

    it('accepts a hash computed with ISO 2-decimal rounding (SAR)', async () => {
      paymentFindMany.mockResolvedValue([{ id: 'p1' }] as never);
      const sarHash = hmac(
        'x_idchg_audit002_3x_amount42.55x_currencySAR' +
          'x_gateway_referencesa.madax_payment_referencechg_audit002_3' +
          'x_statusCAPTUREDx_created1698392202945',
      );

      const result = await service.handleTapWebhook(
        tapPayload({
          id: 'chg_audit002_3',
          currency: 'SAR',
          reference: { gateway: 'sa.mada', payment: 'chg_audit002_3' },
          transaction: { created: '1698392202945' },
        }),
        sarHash,
      );

      expect(result.received).toBe(true);
    });

    it('fails closed (503) in production when TAP_PAYMENTS_SECRET_KEY is missing', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      delete process.env.TAP_PAYMENTS_SECRET_KEY;
      try {
        await expect(service.handleTapWebhook(tapPayload(), capturedHash)).rejects.toThrow(
          ServiceUnavailableException,
        );
        expect(paymentUpdate).not.toHaveBeenCalled();
      } finally {
        if (originalNodeEnv === undefined) {
          delete process.env.NODE_ENV;
        } else {
          process.env.NODE_ENV = originalNodeEnv;
        }
        process.env.TAP_PAYMENTS_SECRET_KEY = TAP_SECRET;
      }
    });
  });

  // ==========================================
  // AUDIT-002 Finding #3 — wallet payment idempotency
  // ==========================================
  describe('createWalletPayment idempotency (AUDIT-002 Finding #3)', () => {
    beforeEach(() => {
      mockStripePaymentIntentsCreate.mockClear();
    });

    const tapFetchMock = () =>
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ id: 'chg_idem_1', status: 'INITIATED', transaction: { url: 'https://tap/pay' } }),
      } as never);

    const tapRequestBodyIdempotent = (fetchSpy: jest.SpyInstance, callIndex: number): string | undefined => {
      const [, init] = fetchSpy.mock.calls[callIndex];
      const body = JSON.parse((init as RequestInit).body as string) as {
        reference: { idempotent?: string };
      };
      return body.reference.idempotent;
    };

    it('Tap double-submit reuses the original charge (same idempotent string, one row)', async () => {
      process.env.TAP_PAYMENTS_SECRET_KEY = 'sk_test_tap_idem';
      const fetchSpy = tapFetchMock();
      // Simulate the real DB: once the first attempt is persisted, a lookup by
      // transactionReference finds the existing row (dedup reuses it).
      paymentFindMany.mockImplementation(async (args: Record<string, unknown>) => {
        if ('transactionReference' in args) {
          return paymentCreate.mock.calls.length >= 1 ? ([{ id: 'pay-idem-1' }] as never) : ([] as never);
        }
        return [] as never;
      });

      const first = await service.createWalletPayment(dto(), TENANT, USER);
      const second = await service.createWalletPayment(dto(), TENANT, USER);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      // Both provider calls carry the SAME deterministic reference.idempotent,
      // so Tap returns the original charge instead of creating a second one.
      expect(tapRequestBodyIdempotent(fetchSpy, 0)).toBe(`${TENANT}:${ORDER_ID}:knet`);
      expect(tapRequestBodyIdempotent(fetchSpy, 1)).toBe(`${TENANT}:${ORDER_ID}:knet`);
      // Only ONE row is ever written — the second call reuses the first.
      expect(paymentCreate).toHaveBeenCalledTimes(1);
      expect(first.paymentId).toBe('chg_idem_1');
      expect(second.paymentId).toBe('chg_idem_1');
    });

    it('Stripe double-submit sends the same Idempotency-Key and writes one row', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_stripe_idem';
      paymentFindMany.mockImplementation(async (args: Record<string, unknown>) => {
        if ('transactionReference' in args) {
          return paymentCreate.mock.calls.length >= 1 ? ([{ id: 'pay-idem-1' }] as never) : ([] as never);
        }
        return [] as never;
      });

      const first = await service.createWalletPayment(
        dto({ paymentMethod: PaymentMethodType.APPLE_PAY, walletType: 'apple_pay' }),
        TENANT,
        USER,
      );
      const second = await service.createWalletPayment(
        dto({ paymentMethod: PaymentMethodType.APPLE_PAY, walletType: 'apple_pay' }),
        TENANT,
        USER,
      );

      expect(mockStripePaymentIntentsCreate).toHaveBeenCalledTimes(2);
      for (const call of mockStripePaymentIntentsCreate.mock.calls) {
        expect(call[1]).toEqual({ idempotencyKey: `${TENANT}:${ORDER_ID}:apple_pay` });
      }
      expect(paymentCreate).toHaveBeenCalledTimes(1);
      expect(first.paymentId).toBe('pi_idem_1');
      expect(second.paymentId).toBe('pi_idem_1');
    });

    it('derives a distinct idempotency key per wallet type', async () => {
      process.env.TAP_PAYMENTS_SECRET_KEY = 'sk_test_tap_idem';
      const fetchSpy = tapFetchMock();

      await service.createWalletPayment(dto({ walletType: 'knet' }), TENANT, USER);
      await service.createWalletPayment(dto({ walletType: 'benefit' }), TENANT, USER);

      expect(tapRequestBodyIdempotent(fetchSpy, 0)).toBe(`${TENANT}:${ORDER_ID}:knet`);
      expect(tapRequestBodyIdempotent(fetchSpy, 1)).toBe(`${TENANT}:${ORDER_ID}:benefit`);
      expect(tapRequestBodyIdempotent(fetchSpy, 0)).not.toBe(tapRequestBodyIdempotent(fetchSpy, 1));
    });

    it('refuses to create a charge for an already-paid order (409, provider never called)', async () => {
      process.env.TAP_PAYMENTS_SECRET_KEY = 'sk_test_tap_idem';
      const fetchSpy = tapFetchMock();
      paymentFindMany.mockResolvedValue([{ id: 'p1', status: 'PAID' }] as never);

      await expect(service.createWalletPayment(dto(), TENANT, USER)).rejects.toThrow(ConflictException);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(paymentCreate).not.toHaveBeenCalled();
    });

    it('refuses an order with a REFUNDED payment too (409)', async () => {
      paymentFindMany.mockResolvedValue([{ id: 'p1', status: 'REFUNDED' }] as never);

      await expect(service.createWalletPayment(dto(), TENANT, USER)).rejects.toThrow(ConflictException);
      expect(paymentCreate).not.toHaveBeenCalled();
    });

    it('reuses the existing row when a concurrent insert wins the race (P2002)', async () => {
      process.env.TAP_PAYMENTS_SECRET_KEY = 'sk_test_tap_idem';
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'chg_race_1', status: 'INITIATED' }),
      } as never);

      // Call order: settled-guard findMany({orderId}) -> [], dedup
      // findMany({transactionReference}) -> [], create rejects with P2002,
      // catch re-reads findMany({transactionReference}) -> existing row.
      paymentFindMany
        .mockResolvedValueOnce([] as never)
        .mockResolvedValueOnce([] as never)
        .mockResolvedValueOnce([{ id: 'p-race' }] as never);
      paymentCreate.mockRejectedValueOnce({ code: 'P2002' } as never);

      const result = await service.createWalletPayment(dto(), TENANT, USER);

      expect(result.paymentId).toBe('chg_race_1');
      expect(paymentCreate).toHaveBeenCalledTimes(1);
      expect(paymentFindMany).toHaveBeenCalledWith({ transactionReference: 'tap_payments:chg_race_1' });
    });

    it('keeps the POS path unchanged (no key, replay still records)', async () => {
      await service.createWalletPayment(
        dto({ paymentMethod: PaymentMethodType.CASH, walletType: 'cash' }),
        TENANT,
        USER,
      );
      await service.createWalletPayment(
        dto({ paymentMethod: PaymentMethodType.CASH, walletType: 'cash' }),
        TENANT,
        USER,
      );

      expect(paymentCreate).toHaveBeenCalledTimes(2);
      expect(paymentCreate).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ transactionReference: `pos:pos_cash_${ORDER_ID}` }),
      );
      expect(paymentCreate).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ transactionReference: `pos:pos_cash_${ORDER_ID}` }),
      );
    });
  });

  // ==========================================
  // AUDIT-002 Finding #4 — currency source
  // ==========================================
  describe('createWalletPayment currency source (AUDIT-002 Finding #4)', () => {
    const tapFetch = () =>
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ id: 'chg_cur_1', status: 'INITIATED', transaction: { url: 'https://tap/pay' } }),
      } as never);

    const tapRequestBody = (fetchSpy: jest.SpyInstance, callIndex: number): Record<string, unknown> => {
      const [, init] = fetchSpy.mock.calls[callIndex];
      return JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    };

    beforeEach(() => {
      mockStripePaymentIntentsCreate.mockClear();
    });

    it('uses Restaurant.currency when the client omits currency (Tap receives KWD)', async () => {
      process.env.TAP_PAYMENTS_SECRET_KEY = 'sk_test_tap_cur';
      const fetchSpy = tapFetch();

      const result = await service.createWalletPayment(dto({ currency: undefined }), TENANT, USER);

      expect(tapRequestBody(fetchSpy, 0).currency).toBe('KWD');
      expect(result.currency).toBe('KWD');
    });

    it('uses Restaurant.currency when the client omits currency (Stripe receives KWD, lowercased per Stripe API)', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_stripe_cur';

      await service.createWalletPayment(
        dto({ paymentMethod: PaymentMethodType.APPLE_PAY, walletType: 'apple_pay', currency: undefined }),
        TENANT,
        USER,
      );

      // Stripe requires lowercase ISO codes (existing convention preserved).
      expect(mockStripePaymentIntentsCreate.mock.calls[0][0].currency).toBe('kwd');
    });

    it('accepts a matching uppercase currency and charges Restaurant.currency', async () => {
      process.env.TAP_PAYMENTS_SECRET_KEY = 'sk_test_tap_cur';
      const fetchSpy = tapFetch();

      const result = await service.createWalletPayment(dto({ currency: 'KWD' }), TENANT, USER);

      expect(tapRequestBody(fetchSpy, 0).currency).toBe('KWD');
      expect(result.currency).toBe('KWD');
    });

    it('accepts a case-insensitive match and uses the CANONICAL Restaurant.currency (client kwd never overrides)', async () => {
      process.env.TAP_PAYMENTS_SECRET_KEY = 'sk_test_tap_cur';
      const fetchSpy = tapFetch();

      const result = await service.createWalletPayment(dto({ currency: 'kwd' }), TENANT, USER);

      // The provider receives the canonical 'KWD', NOT the client's 'kwd'.
      expect(tapRequestBody(fetchSpy, 0).currency).toBe('KWD');
      expect(result.currency).toBe('KWD');
    });

    it('rejects a mismatching currency with 400 (SAR vs KWD restaurant) before any provider call', async () => {
      process.env.TAP_PAYMENTS_SECRET_KEY = 'sk_test_tap_cur';
      const fetchSpy = tapFetch();

      await expect(service.createWalletPayment(dto({ currency: 'SAR' }), TENANT, USER)).rejects.toThrow(
        BadRequestException,
      );
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(paymentCreate).not.toHaveBeenCalled();
    });

    it('rejects any arbitrary unsupported currency with 400 (never falls through to a provider)', async () => {
      await expect(service.createWalletPayment(dto({ currency: 'XYZ' }), TENANT, USER)).rejects.toThrow(
        BadRequestException,
      );
      expect(paymentCreate).not.toHaveBeenCalled();
    });

    it('rejects a mismatching currency on the POS rail too (400)', async () => {
      await expect(
        service.createWalletPayment(
          dto({ paymentMethod: PaymentMethodType.CASH, walletType: 'cash', currency: 'USD' }),
          TENANT,
          USER,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(paymentCreate).not.toHaveBeenCalled();
    });

    it('uses Restaurant.currency on the POS result (no hardcoded USD fallback)', async () => {
      const result = await service.createWalletPayment(
        dto({ paymentMethod: PaymentMethodType.CASH, walletType: 'cash', currency: undefined }),
        TENANT,
        USER,
      );

      expect(result.currency).toBe('KWD');
    });

    it('resolves the restaurant ONLY from the tenant-scoped order branch (server-side, never client-supplied)', async () => {
      process.env.TAP_PAYMENTS_SECRET_KEY = 'sk_test_tap_cur';
      const fetchSpy = tapFetch();
      // A different tenant's restaurant for the SAME order branch id would not
      // be reachable — the lookup is tenant-scoped by the repository.
      branchFindById.mockResolvedValueOnce(null as never);

      await expect(service.createWalletPayment(dto(), TENANT, USER)).rejects.toThrow(NotFoundException);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(paymentCreate).not.toHaveBeenCalled();
    });

    it('rejects when the restaurant cannot be resolved under the tenant context', async () => {
      process.env.TAP_PAYMENTS_SECRET_KEY = 'sk_test_tap_cur';
      const fetchSpy = tapFetch();
      restaurantFindById.mockResolvedValueOnce(null as never);

      await expect(service.createWalletPayment(dto(), TENANT, USER)).rejects.toThrow(NotFoundException);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(paymentCreate).not.toHaveBeenCalled();
    });

    it('keeps the order-derived amount intact when currency is server-resolved', async () => {
      process.env.TAP_PAYMENTS_SECRET_KEY = 'sk_test_tap_cur';
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'chg_cur_2', status: 'INITIATED' }),
      } as never);

      const result = await service.createWalletPayment(dto({ currency: undefined }), TENANT, USER);

      // Order total 42.55 is still the charged amount (Finding #2 contract).
      expect(result.amount).toBe(42.55);
      expect(paymentCreate).toHaveBeenCalledWith(expect.objectContaining({ amount: 42.55 }));
    });
  });
});
