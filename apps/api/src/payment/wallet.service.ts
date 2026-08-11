import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { CreateWalletPaymentRequestDto } from './dto/create-wallet-payment-request.dto';
import { PaymentMethodType } from '@zayjar/types';
import { dbTenantContext } from '@zayjar/db';
import {
  TenantBranchRepository,
  TenantOrderRepository,
  TenantPaymentRepository,
  TenantRestaurantRepository,
} from '@zayjar/db';

/**
 * Normalised result of a provider-side status lookup.
 * `status` is the provider's own vocabulary; `settled` is our interpretation.
 */
interface ProviderStatus {
  status: string;
  settled: boolean;
  failed: boolean;
}

export interface WalletPaymentResult {
  paymentId: string;
  provider: string;
  walletType: string;
  amount: number;
  currency: string;
  status: string;
  nextAction?: { type: string; url?: string; stripeSdk?: { walletType: string; clientSecret: string } };
  redirectUrl?: string;
  clientSecret?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface VerifyPaymentResult {
  paymentId: string;
  orderId: string;
  status: string;
  verified: boolean;
  amount: number;
  provider: string;
  tenantId: string;
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  private readonly orderRepository = new TenantOrderRepository();
  private readonly paymentRepository = new TenantPaymentRepository();
  private readonly branchRepository = new TenantBranchRepository();
  private readonly restaurantRepository = new TenantRestaurantRepository();

  // Regional payment gateways per DOC-009 8.3
  private readonly REGIONAL_GATEWAYS: Record<string, { provider: string; countries: string[] }> = {
    knet: { provider: 'tap_payments', countries: ['KW'] },
    benefit: { provider: 'tap_payments', countries: ['BH'] },
    mada: { provider: 'tap_payments', countries: ['SA'] },
    apple_pay: { provider: 'stripe', countries: ['global'] },
    google_pay: { provider: 'stripe', countries: ['global'] },
  };

  /** Wallet types routed through Tap Payments. */
  private static readonly TAP_WALLETS = ['knet', 'benefit', 'mada'];

  /** Bounded wait for an outbound provider HTTP call. */
  private static readonly PROVIDER_TIMEOUT_MS = 10_000;

  /**
   * Maps a wallet type to the `PaymentMethodType` persisted on the record.
   * The enum is intentionally coarse (CASH / CREDIT_CARD / APPLE_PAY /
   * LOCAL_WALLET); the precise rail is kept in `transactionReference`'s
   * provider prefix and in the order's own metadata.
   */
  private toPaymentMethod(walletType: string): PaymentMethodType {
    if (walletType === 'apple_pay' || walletType === 'google_pay') {
      return PaymentMethodType.APPLE_PAY;
    }
    if (WalletService.TAP_WALLETS.includes(walletType)) {
      return PaymentMethodType.LOCAL_WALLET;
    }
    if (walletType === 'cash') {
      return PaymentMethodType.CASH;
    }
    return PaymentMethodType.CREDIT_CARD;
  }

  /**
   * Fails closed when a payment provider is not configured.
   *
   * AUDIT-002: the previous implementation silently substituted a fabricated
   * session/charge id whenever a provider key was absent — and, for Tap, even
   * when the key WAS present. Callers could not distinguish a real payment
   * from a fake one, so an unconfigured deployment appeared to take money.
   * Refusing the request is the only safe behaviour for a money path.
   */
  private assertProviderConfigured(value: string | undefined, envVar: string, rail: string): string {
    if (!value) {
      this.logger.error(`${envVar} is not configured — refusing to create a ${rail} payment.`);
      throw new ServiceUnavailableException(
        `${rail} payments are not available: the payment provider is not configured.`,
      );
    }
    return value;
  }

  /**
   * Creates regional wallet payment session per DOC-009 8.3.
   * Supports Apple Pay / Google Pay via Stripe, and KNET / Benefit / Mada via
   * Tap Payments. Tenant isolation enforced via dbTenantContext and order
   * ownership. Every attempt is persisted to the `payments` table.
   */
  async createWalletPayment(
    dto: CreateWalletPaymentRequestDto,
    tenantId: string,
    userId: string,
  ): Promise<WalletPaymentResult> {
    this.logger.log(
      `Creating wallet payment for tenant [${tenantId}] order [${dto.orderId}] method [${dto.paymentMethod}] wallet [${dto.walletType}]`,
    );

    // Validate order exists and belongs to tenant
    const order = await dbTenantContext.run({ tenantId }, async () => {
      return this.orderRepository.findById(dto.orderId);
    });

    if (!order) {
      throw new NotFoundException(`Order with ID [${dto.orderId}] not found under tenant context`);
    }

    if (!Object.values(PaymentMethodType).includes(dto.paymentMethod)) {
      throw new BadRequestException(`Invalid payment method [${dto.paymentMethod}]`);
    }

    // Determine wallet type from payment method if not explicitly provided
    let walletType = dto.walletType;
    if (!walletType) {
      if (dto.paymentMethod === PaymentMethodType.APPLE_PAY) {
        walletType = 'apple_pay';
      } else if (dto.paymentMethod === PaymentMethodType.LOCAL_WALLET) {
        walletType = 'knet';
      } else {
        walletType = 'credit_card';
      }
    }

    if (!this.REGIONAL_GATEWAYS[walletType] && walletType !== 'credit_card' && walletType !== 'cash') {
      throw new BadRequestException(
        `Unsupported wallet type [${walletType}]. Supported: ${Object.keys(this.REGIONAL_GATEWAYS).join(', ')}, credit_card, cash`,
      );
    }

    // The charged amount is taken from the ORDER, never from the client.
    // Trusting `dto.amount` would let a caller pay 0.01 for a 42.55 order.
    const orderTotal = Number((order as unknown as { total: unknown }).total);
    if (!Number.isFinite(orderTotal) || orderTotal <= 0) {
      throw new BadRequestException('Order total is not payable.');
    }

    // AUDIT-002 Finding #4: the charge currency is resolved SERVER-SIDE from
    // the tenant-owned order's restaurant (Order → Branch → Restaurant.currency)
    // — never from the client. Both lookups use the same tenant-scoped
    // repository pattern as the order lookup (mirrors order.service.ts
    // checkout), so a branch/restaurant that is not owned by this tenant
    // resolves to null and cannot be reached.
    const branch = await dbTenantContext.run({ tenantId }, async () => {
      return this.branchRepository.findById((order as unknown as { branchId: string }).branchId);
    });
    if (!branch) {
      throw new NotFoundException(`The order branch could not be resolved under tenant context.`);
    }

    const restaurant = await dbTenantContext.run({ tenantId }, async () => {
      return this.restaurantRepository.findById(
        (branch as unknown as { restaurantId: string }).restaurantId,
      );
    });
    if (!restaurant) {
      throw new NotFoundException(`The order restaurant could not be resolved under tenant context.`);
    }

    const restaurantCurrency = (restaurant as unknown as { currency: string }).currency;

    // AUDIT-002 Finding #4: the client MAY supply a currency, but it can only
    // confirm the restaurant's authoritative currency (case-insensitive
    // comparison) — it can never override it. Any mismatch is rejected with
    // 400 BEFORE any provider call.
    if (dto.currency && dto.currency.toUpperCase() !== restaurantCurrency.toUpperCase()) {
      throw new BadRequestException(
        `Currency [${dto.currency}] does not match the restaurant currency [${restaurantCurrency}].`,
      );
    }

    // AUDIT-002 Finding #3: never create a second charge for an order that
    // already settled. A cross-wallet replay (KNET paid, then a Mada attempt)
    // must fail here instead of contacting the provider again.
    const alreadySettled = await dbTenantContext.run({ tenantId }, async () => {
      const rows = await this.paymentRepository.findMany({ orderId: dto.orderId });
      return rows.some(
        (row) =>
          (row as unknown as { status: string }).status === 'PAID' ||
          (row as unknown as { status: string }).status === 'REFUNDED',
      );
    });
    if (alreadySettled) {
      throw new ConflictException(`Order [${dto.orderId}] is already paid.`);
    }

    const gatewayInfo = this.REGIONAL_GATEWAYS[walletType];
    const provider = gatewayInfo ? gatewayInfo.provider : 'stripe';

    // AUDIT-002 Finding #3: deterministic provider-level idempotency key,
    // derived server-side (JWT tenantId + order UUID + wallet enum). Identical
    // double-submits therefore reuse the SAME key, and the provider returns
    // the original charge instead of creating a second one — the only
    // race-safe guarantee for concurrent duplicate requests.
    const idempotencyKey = `${tenantId}:${dto.orderId}:${walletType}`;

    let result: WalletPaymentResult;
    if (walletType === 'apple_pay' || walletType === 'google_pay') {
      result = await this.createStripeWalletPayment(
        dto,
        walletType,
        provider,
        tenantId,
        userId,
        orderTotal,
        idempotencyKey,
        restaurantCurrency,
      );
    } else if (WalletService.TAP_WALLETS.includes(walletType)) {
      result = await this.createTapPayment(
        dto,
        walletType,
        provider,
        orderTotal,
        tenantId,
        idempotencyKey,
        restaurantCurrency,
      );
    } else {
      // credit_card / cash are settled at the till, not through a wallet rail.
      result = {
        paymentId: `pos_${walletType}_${dto.orderId}`,
        provider: 'pos',
        walletType,
        amount: orderTotal,
        currency: restaurantCurrency,
        status: 'pending',
        successUrl: dto.successUrl,
        cancelUrl: dto.cancelUrl,
      };
    }

    const transactionReference = `${result.provider}:${result.paymentId}`;

    // AUDIT-002 Finding #3: post-provider deduplication. With the idempotency
    // key the provider returns the ORIGINAL charge for a replay — if that
    // charge is already recorded, reuse the existing session instead of
    // inserting a second row. POS references (deterministic by design) keep
    // their legacy replay behaviour and are excluded from the DB constraint.
    const isPosReference = transactionReference.startsWith('pos:');
    const existingRow = isPosReference
      ? null
      : await dbTenantContext.run({ tenantId }, async () => {
          const matches = await this.paymentRepository.findMany({ transactionReference });
          return matches[0] ?? null;
        });

    if (existingRow) {
      this.logger.log(
        `Payment [${transactionReference}] already recorded — reusing existing session.`,
      );
      return { ...result, amount: orderTotal };
    }

    // Persist the attempt. A payment that is not recorded cannot be
    // reconciled, refunded or audited — this was AUDIT-002's second defect.
    await dbTenantContext.run({ tenantId }, async () => {
      try {
        await this.paymentRepository.create({
          orderId: dto.orderId,
          paymentMethod: this.toPaymentMethod(walletType as string),
          status: 'PENDING',
          amount: orderTotal,
          transactionReference,
        });
      } catch (err) {
        const prismaError = err as { code?: string };
        // AUDIT-002 Finding #3: a truly concurrent duplicate request inserted
        // the same reference between our check and our insert (unique index
        // idx_payments_reference_unique). Reuse that row — the charge is the
        // same provider object — instead of surfacing a 500.
        if (prismaError.code !== 'P2002') {
          throw err;
        }
        const matches = await this.paymentRepository.findMany({ transactionReference });
        if (!matches[0]) {
          throw err;
        }
        this.logger.warn(
          `Concurrent duplicate insert for [${transactionReference}] — reusing existing record.`,
        );
      }
    });

    this.logger.log(
      `Recorded PENDING payment [${result.provider}:${result.paymentId}] for order [${dto.orderId}] amount [${orderTotal}]`,
    );

    return { ...result, amount: orderTotal };
  }

  private async createStripeWalletPayment(
    dto: CreateWalletPaymentRequestDto,
    walletType: string,
    provider: string,
    tenantId: string,
    userId: string,
    amount: number,
    idempotencyKey: string,
    currency: string,
  ): Promise<WalletPaymentResult> {
    const stripeSecretKey = this.assertProviderConfigured(
      process.env.STRIPE_SECRET_KEY,
      'STRIPE_SECRET_KEY',
      walletType,
    );

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Stripe = require('stripe');
      const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });

      // AUDIT-002 Finding #3: deterministic Idempotency-Key so identical
      // double-submits return the original PaymentIntent, never a second one.
      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount: Math.round(amount * 100), // minor units
          // AUDIT-002 Finding #4: the charge currency is the server-resolved
          // Restaurant.currency; Stripe requires lowercase ISO codes.
          currency: currency.toLowerCase(),
          payment_method_types: walletType === 'apple_pay' ? ['card', 'apple_pay'] : ['card', 'google_pay'],
          metadata: { tenantId, orderId: dto.orderId, walletType, userId },
          receipt_email: dto.customerEmail,
        },
        { idempotencyKey },
      );

      return {
        paymentId: paymentIntent.id,
        provider,
        walletType,
        amount,
        currency,
        status: paymentIntent.status,
        clientSecret: paymentIntent.client_secret,
        successUrl: dto.successUrl,
        cancelUrl: dto.cancelUrl,
      };
    } catch (err) {
      this.logger.error(`Stripe ${walletType} payment creation failed: ${(err as Error).message}`);
      throw new BadRequestException(`Failed to create ${walletType} payment: ${(err as Error).message}`);
    }
  }

  /**
   * Real Tap Payments charge creation (KNET / Benefit / Mada).
   *
   * AUDIT-002: this method previously returned a fabricated `chg_…` id even
   * when `TAP_PAYMENTS_SECRET_KEY` was set — the comment read
   * "we mock success for test/dev". The Gulf rails therefore never contacted
   * Tap at all.
   */
  private async createTapPayment(
    dto: CreateWalletPaymentRequestDto,
    walletType: string,
    provider: string,
    amount: number,
    tenantId: string,
    idempotencyKey: string,
    currency: string,
  ): Promise<WalletPaymentResult> {
    const tapSecretKey = this.assertProviderConfigured(
      process.env.TAP_PAYMENTS_SECRET_KEY,
      'TAP_PAYMENTS_SECRET_KEY',
      walletType,
    );

    const sourceId = walletType === 'knet' ? 'src_kw.knet' : walletType === 'benefit' ? 'src_bh.benefit' : 'src_sa.mada';

    try {
      const response = await this.httpJson(
        `${process.env.TAP_PAYMENTS_API_URL || 'https://api.tap.company'}/v2/charges`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tapSecretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount,
            currency,
            source: { id: sourceId },
            // AUDIT-002 Finding #3: official Tap idempotency — a reused
            // `reference.idempotent` within 24h returns the original charge
            // instead of creating a second one (developers.tap.company/docs/idempotency).
            reference: { order: dto.orderId, idempotent: idempotencyKey },
            redirect: { url: dto.successUrl },
            customer: dto.customerEmail ? { email: dto.customerEmail } : undefined,
            // AUDIT-002 Finding #2: echoed back on the webhook and used to
            // resolve the tenant before any settlement write.
            metadata: { udf1: tenantId, udf2: dto.orderId },
          }),
        },
      );

      const charge = response as Record<string, unknown>;
      const chargeId = String(charge.id ?? '');
      if (!chargeId) {
        throw new Error('Tap response did not include a charge id');
      }

      const transaction = charge.transaction as Record<string, unknown> | undefined;
      const redirectUrl = transaction?.url ? String(transaction.url) : undefined;

      return {
        paymentId: chargeId,
        provider,
        walletType,
        amount,
        currency,
        status: String(charge.status ?? 'INITIATED').toLowerCase(),
        redirectUrl,
        nextAction: redirectUrl ? { type: 'redirect', url: redirectUrl } : undefined,
        successUrl: dto.successUrl,
        cancelUrl: dto.cancelUrl,
      };
    } catch (err) {
      this.logger.error(`Tap Payments ${walletType} creation failed: ${(err as Error).message}`);
      throw new BadRequestException(
        `Failed to create ${walletType} payment via Tap: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Verifies a payment against the PROVIDER and reconciles our record.
   *
   * AUDIT-002 (critical): the previous implementation ignored `paymentId`
   * entirely and unconditionally returned `{status:'succeeded', verified:true}`
   * — runtime-proven with the id `I-JUST-MADE-THIS-UP`. Any caller could claim
   * any payment had settled.
   *
   * The rewritten flow:
   *   1. Look the payment up in OUR table, tenant-scoped (unknown id -> 404).
   *   2. Ask the provider for the authoritative status.
   *   3. Persist the resulting state transition.
   *   4. Report the provider's answer — never an assumption.
   */
  async verifyPayment(paymentId: string, tenantId: string): Promise<VerifyPaymentResult> {
    this.logger.log(`Verifying wallet payment [${paymentId}] for tenant [${tenantId}]`);

    const record = await dbTenantContext.run({ tenantId }, async () => {
      const matches = await this.paymentRepository.findMany({
        transactionReference: { endsWith: `:${paymentId}` },
      });
      return matches[0] ?? null;
    });

    if (!record) {
      // Unknown to this tenant: 404, never a synthesised success.
      throw new NotFoundException(`Payment with reference [${paymentId}] was not found.`);
    }

    const row = record as unknown as {
      id: string;
      orderId: string;
      status: string;
      amount: unknown;
      transactionReference: string | null;
    };
    const provider = (row.transactionReference ?? '').split(':')[0] || 'unknown';

    // Terminal states are not re-queried: they cannot change back.
    if (row.status === 'PAID' || row.status === 'REFUNDED' || row.status === 'FAILED') {
      return {
        paymentId,
        orderId: row.orderId,
        status: row.status,
        verified: row.status === 'PAID',
        amount: Number(row.amount),
        provider,
        tenantId,
      };
    }

    const providerStatus = await this.fetchProviderStatus(provider, paymentId);
    const nextStatus = providerStatus.settled ? 'PAID' : providerStatus.failed ? 'FAILED' : row.status;

    if (nextStatus !== row.status) {
      await dbTenantContext.run({ tenantId }, async () => {
        await this.paymentRepository.update(row.id, {
          status: nextStatus,
          completedAt: providerStatus.settled ? new Date() : null,
        });
      });
      this.logger.log(`Payment [${paymentId}] transitioned ${row.status} -> ${nextStatus}`);
    }

    return {
      paymentId,
      orderId: row.orderId,
      status: nextStatus,
      verified: nextStatus === 'PAID',
      amount: Number(row.amount),
      provider,
      tenantId,
    };
  }

  /**
   * Authoritative status lookup against the real provider API.
   * Never invents a result: an unreachable provider surfaces as 503 so the
   * caller retries instead of treating the payment as settled.
   */
  private async fetchProviderStatus(provider: string, paymentId: string): Promise<ProviderStatus> {
    if (provider === 'stripe') {
      const key = this.assertProviderConfigured(
        process.env.STRIPE_SECRET_KEY,
        'STRIPE_SECRET_KEY',
        'stripe',
      );
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Stripe = require('stripe');
        const stripe = new Stripe(key, { apiVersion: '2023-10-16' });
        const intent = await stripe.paymentIntents.retrieve(paymentId);
        const status = String(intent.status);
        return {
          status,
          settled: status === 'succeeded',
          failed: status === 'canceled' || status === 'payment_failed',
        };
      } catch (err) {
        this.logger.error(`Stripe verification failed for [${paymentId}]: ${(err as Error).message}`);
        throw new ServiceUnavailableException(
          'Unable to verify the payment with the provider right now. Please retry.',
        );
      }
    }

    if (provider === 'tap_payments') {
      const key = this.assertProviderConfigured(
        process.env.TAP_PAYMENTS_SECRET_KEY,
        'TAP_PAYMENTS_SECRET_KEY',
        'tap',
      );
      try {
        const charge = (await this.httpJson(
          `${process.env.TAP_PAYMENTS_API_URL || 'https://api.tap.company'}/v2/charges/${encodeURIComponent(paymentId)}`,
          { method: 'GET', headers: { Authorization: `Bearer ${key}` } },
        )) as Record<string, unknown>;
        const status = String(charge.status ?? '').toUpperCase();
        return {
          status,
          settled: status === 'CAPTURED',
          failed: status === 'FAILED' || status === 'DECLINED' || status === 'CANCELLED',
        };
      } catch (err) {
        this.logger.error(`Tap verification failed for [${paymentId}]: ${(err as Error).message}`);
        throw new ServiceUnavailableException(
          'Unable to verify the payment with the provider right now. Please retry.',
        );
      }
    }

    if (provider === 'pos') {
      // Cash / card at the till is settled by staff closing the order, not by
      // an external rail. It is never auto-verified here.
      return { status: 'PENDING', settled: false, failed: false };
    }

    throw new ServiceUnavailableException(`No verification path for provider [${provider}].`);
  }

  /** Minimal JSON HTTP helper with a bounded timeout. */
  private async httpJson(url: string, init: Record<string, unknown>): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WalletService.PROVIDER_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal } as RequestInit);
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`provider responded ${res.status}: ${text.slice(0, 200)}`);
      }
      return text ? JSON.parse(text) : {};
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * ISO-standard decimal places per currency (Tap webhook hashstring
   * rounding; Tap official docs). Unknown currencies default to 2.
   */
  private static readonly CURRENCY_DECIMALS: Record<string, number> = {
    KWD: 3,
    BHD: 3,
    OMR: 3,
    JOD: 3,
    AED: 2,
    SAR: 2,
    QAR: 2,
    USD: 2,
    EUR: 2,
    GBP: 2,
    EGP: 2,
  };

  /**
   * Computes the official Tap webhook `hashstring`: HMAC-SHA256 (hex) of the
   * concatenation of posted charge fields —
   *   x_id{id}x_amount{amount}x_currency{currency}x_gateway_reference{gateway}
   *   x_payment_reference{payment}x_status{status}x_created{created}
   * with `amount` rounded to the currency's ISO-standard decimals.
   * (AUDIT-002 Finding #2; per developers.tap.company/docs/webhook.)
   */
  private computeTapHashstring(payload: Record<string, unknown>, secretKey: string): string {
    const reference = (payload.reference as Record<string, unknown>) ?? {};
    const transaction = (payload.transaction as Record<string, unknown>) ?? {};

    const id = String(payload.id ?? '');
    const currency = String(payload.currency ?? '');
    const decimals = WalletService.CURRENCY_DECIMALS[currency] ?? 2;
    const amount = Number(payload.amount).toFixed(decimals);
    const gatewayReference = String(reference.gateway ?? '');
    const paymentReference = String(reference.payment ?? '');
    const status = String(payload.status ?? '');
    const created = String(transaction.created ?? '');

    const toBeHashed =
      `x_id${id}x_amount${amount}x_currency${currency}` +
      `x_gateway_reference${gatewayReference}x_payment_reference${paymentReference}` +
      `x_status${status}x_created${created}`;

    return createHmac('sha256', secretKey).update(toBeHashed).digest('hex');
  }

  /**
   * Handles the Tap Payments webhook (server-to-server POST of the raw charge
   * object for CAPTURED / FAILED transactions only).
   *
   * AUDIT-002 Finding #2: the previously implemented `settleFromWebhook` had
   * zero production callers. This is the verified inbound path:
   *   1. Fail closed (503) in production when TAP_PAYMENTS_SECRET_KEY is
   *      missing — mirroring the Stripe webhook behaviour (Finding #1).
   *   2. Verify the official `hashstring` header (HMAC-SHA256, constant-time)
   *      BEFORE any state change; forged payloads get 400.
   *   3. Resolve the tenant ONLY from the verified `metadata.udf1` (written at
   *      charge creation) and settle via the tenant-scoped
   *      `settleFromWebhook` — an unscoped write is impossible.
   * Tap retries twice on failure; a 200 acknowledges the post.
   */
  async handleTapWebhook(
    payload: Record<string, unknown>,
    hashstringHeader: string | undefined,
  ): Promise<{ received: boolean }> {
    const secretKey = process.env.TAP_PAYMENTS_SECRET_KEY;
    if (!secretKey) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.error(
          'TAP_PAYMENTS_SECRET_KEY is not configured in production — refusing to process the Tap webhook (fail closed).',
        );
        throw new ServiceUnavailableException(
          'Tap webhook processing is unavailable: TAP_PAYMENTS_SECRET_KEY is not configured.',
        );
      }
      this.logger.warn('TAP_PAYMENTS_SECRET_KEY not configured, skipping hashstring verification (dev mode).');
    } else {
      if (!hashstringHeader) {
        throw new BadRequestException('Missing Tap hashstring header');
      }
      const computed = this.computeTapHashstring(payload, secretKey);
      const expected = Buffer.from(computed, 'hex');
      const provided = Buffer.from(hashstringHeader, 'hex');
      if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
        this.logger.warn('Tap webhook rejected: hashstring verification failed.');
        throw new BadRequestException('Tap webhook signature verification failed');
      }
    }

    const metadata = payload.metadata as Record<string, unknown> | undefined;
    const tenantId = metadata?.udf1 ? String(metadata.udf1) : undefined;
    if (!tenantId) {
      this.logger.warn('Tap webhook carried no metadata.udf1 — cannot resolve the tenant, skipping settlement.');
      return { received: true };
    }

    const chargeId = String(payload.id ?? '');
    const status = String(payload.status ?? '').toUpperCase();
    if (status === 'CAPTURED') {
      await this.settleFromWebhook(chargeId, tenantId, true);
    } else if (status === 'FAILED' || status === 'DECLINED' || status === 'CANCELLED') {
      await this.settleFromWebhook(chargeId, tenantId, false);
    } else {
      this.logger.log(`Tap webhook status [${status}] for [${chargeId}] — no state change.`);
    }

    return { received: true };
  }

  /**
   * Marks a payment settled from a verified provider webhook.
   * Exposed for the webhook path; performs the same reconciliation write as
   * `verifyPayment` without polling the provider.
   */
  async settleFromWebhook(
    providerPaymentId: string,
    tenantId: string,
    settled: boolean,
  ): Promise<void> {
    await dbTenantContext.run({ tenantId }, async () => {
      const matches = await this.paymentRepository.findMany({
        transactionReference: { endsWith: `:${providerPaymentId}` },
      });
      const record = matches[0] as unknown as { id: string } | undefined;
      if (!record) {
        this.logger.warn(`Webhook referenced unknown payment [${providerPaymentId}]`);
        return;
      }
      await this.paymentRepository.update(record.id, {
        status: settled ? 'PAID' : 'FAILED',
        completedAt: settled ? new Date() : null,
      });
    });
  }

  /** Exposed for reconciliation tooling: all payments for one order. */
  async listForOrder(orderId: string, tenantId: string): Promise<unknown[]> {
    return dbTenantContext.run({ tenantId }, async () => {
      return this.paymentRepository.findMany({ orderId });
    });
  }
}
