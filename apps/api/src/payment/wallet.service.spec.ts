import { WalletService } from './wallet.service';
import { TenantOrderRepository, TenantPaymentRepository } from '@zayjar/db';
import {
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PaymentMethodType } from '@zayjar/types';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock-hash'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

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
  let paymentCreate: jest.SpyInstance;
  let paymentFindMany: jest.SpyInstance;
  let paymentUpdate: jest.SpyInstance;

  const order = { id: ORDER_ID, total: '42.55', tenantId: TENANT };

  beforeEach(() => {
    service = new WalletService();
    jest.restoreAllMocks();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.TAP_PAYMENTS_SECRET_KEY;

    orderFindById = jest
      .spyOn(TenantOrderRepository.prototype, 'findById')
      .mockResolvedValue(order as never);
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
});
