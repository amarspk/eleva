import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { WalletService, WalletPaymentResult, VerifyPaymentResult } from './wallet.service';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { CaslAbilityFactory } from '../auth/casl-ability.factory';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { REQUIRE_PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { AuthenticatedRequest } from '../common/types/request.types';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock-hash'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

/**
 * AUDIT-002 Finding #5 (RBAC) — PaymentController authorization contract.
 *
 * Uses the REAL RbacPermissionGuard + CaslAbilityFactory + real Reflector and
 * the REAL controller handlers (so the @RequirePermission / @Public metadata
 * wiring is itself under test), with JwtAuthGuard replaced by a stub that
 * injects the role under test. WalletService is fully mocked — no provider
 * calls are ever made from these tests.
 *
 * Contract verified here:
 *   POST /api/v1/payments/wallet                 -> payment:create (OWNER/MANAGER/CASHIER; KITCHEN 403)
 *   GET  /api/v1/payments/wallet/:paymentId/verify -> payment:read   (OWNER/MANAGER/CASHIER; KITCHEN 403)
 *   POST /api/v1/payments/webhooks/tap           -> @Public() + hashstring-verified (no RBAC metadata)
 */
describe('PaymentController (AUDIT-002 Finding #5 — RBAC)', () => {
  let controller: PaymentController;
  let guard: RbacPermissionGuard;
  let reflector: Reflector;
  let walletService: {
    createWalletPayment: jest.Mock;
    verifyPayment: jest.Mock;
    handleTapWebhook: jest.Mock;
    settleFromWebhook: jest.Mock;
    listForOrder: jest.Mock;
  };

  // The user the stubbed JwtAuthGuard attaches to every request.
  let currentUser: Record<string, unknown> | undefined;

  const walletResult: WalletPaymentResult = {
    paymentId: 'chg_test_1',
    provider: 'tap_payments',
    walletType: 'knet',
    amount: 42.55,
    currency: 'KWD',
    status: 'initiated',
    successUrl: 'https://example.com/success',
    cancelUrl: 'https://example.com/cancel',
  };
  const verifyResult: VerifyPaymentResult = {
    paymentId: 'chg_test_1',
    orderId: 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa',
    status: 'PENDING',
    verified: false,
    amount: 42.55,
    provider: 'tap_payments',
    tenantId: 'tenant-1',
  };

  beforeEach(async () => {
    walletService = {
      createWalletPayment: jest.fn().mockResolvedValue(walletResult),
      verifyPayment: jest.fn().mockResolvedValue(verifyResult),
      handleTapWebhook: jest.fn().mockResolvedValue({ received: true }),
      settleFromWebhook: jest.fn().mockResolvedValue(undefined),
      listForOrder: jest.fn().mockResolvedValue([]),
    };

    currentUser = undefined;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [
        { provide: WalletService, useValue: walletService },
        RbacPermissionGuard,
        CaslAbilityFactory,
        Reflector,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext): boolean => {
          const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
          if (currentUser) {
            req.user = currentUser as unknown as AuthenticatedRequest["user"];
          }
          return true;
        },
      })
      .compile();

    controller = module.get(PaymentController);
    guard = module.get(RbacPermissionGuard);
    reflector = module.get(Reflector);
  });

  // Direct guard.canActivate() calls never run the stubbed JwtAuthGuard, so the
  // request carries the role under test itself (lazily read per context).
  const request = (): AuthenticatedRequest =>
    ({ user: currentUser as unknown as AuthenticatedRequest["user"], headers: {} }) as unknown as AuthenticatedRequest;

  const contextFor = (handler: (...args: never[]) => unknown): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => PaymentController,
      switchToHttp: () => ({ getRequest: () => request() }),
    }) as unknown as ExecutionContext;

  const owner = { id: 'u-owner', tenantId: 'tenant-1', roles: ['RESTAURANT_OWNER'], permissions: ['payment:create', 'payment:read'] };
  const manager = { id: 'u-manager', tenantId: 'tenant-1', roles: ['MANAGER'], permissions: ['payment:create', 'payment:read'] };
  const cashier = { id: 'u-cashier', tenantId: 'tenant-1', roles: ['CASHIER'], permissions: ['payment:create', 'payment:read'] };
  const kitchen = { id: 'u-kitchen', tenantId: 'tenant-1', roles: ['KITCHEN_STAFF'], permissions: ['order:read', 'kds:write'] };

  // ==========================================
  // Unauthenticated
  // ==========================================
  it('rejects an unauthenticated wallet-create request (401)', async () => {
    currentUser = undefined;

    await expect(
      guard.canActivate(contextFor(PaymentController.prototype.createWalletPayment as never)),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an unauthenticated wallet-verify request (401)', async () => {
    currentUser = undefined;

    await expect(
      guard.canActivate(contextFor(PaymentController.prototype.verifyPayment as never)),
    ).rejects.toThrow(UnauthorizedException);
  });

  // ==========================================
  // KITCHEN_STAFF (no payment permissions)
  // ==========================================
  it('forbids KITCHEN_STAFF from creating a wallet payment (403)', async () => {
    currentUser = kitchen;

    await expect(
      guard.canActivate(contextFor(PaymentController.prototype.createWalletPayment as never)),
    ).rejects.toThrow(ForbiddenException);
  });

  it('forbids KITCHEN_STAFF from verifying a wallet payment (403)', async () => {
    currentUser = kitchen;

    await expect(
      guard.canActivate(contextFor(PaymentController.prototype.verifyPayment as never)),
    ).rejects.toThrow(ForbiddenException);
  });

  // ==========================================
  // CASHIER
  // ==========================================
  it('allows CASHIER to create a wallet payment and passes the tenant-scoped call through', async () => {
    currentUser = cashier;

    await expect(
      guard.canActivate(contextFor(PaymentController.prototype.createWalletPayment as never)),
    ).resolves.toBe(true);

    const result = await controller.createWalletPayment(
      { orderId: 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa' } as never,
      request(),
    );
    expect(walletService.createWalletPayment).toHaveBeenCalled();
    expect(result.paymentId).toBe('chg_test_1');
  });

  it('allows CASHIER to verify a wallet payment', async () => {
    currentUser = cashier;

    await expect(
      guard.canActivate(contextFor(PaymentController.prototype.verifyPayment as never)),
    ).resolves.toBe(true);
  });

  // ==========================================
  // MANAGER
  // ==========================================
  it('allows MANAGER to create and verify wallet payments', async () => {
    currentUser = manager;

    await expect(
      guard.canActivate(contextFor(PaymentController.prototype.createWalletPayment as never)),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(contextFor(PaymentController.prototype.verifyPayment as never)),
    ).resolves.toBe(true);
  });

  // ==========================================
  // RESTAURANT_OWNER
  // ==========================================
  it('allows RESTAURANT_OWNER to create and verify wallet payments', async () => {
    currentUser = owner;

    await expect(
      guard.canActivate(contextFor(PaymentController.prototype.createWalletPayment as never)),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(contextFor(PaymentController.prototype.verifyPayment as never)),
    ).resolves.toBe(true);
  });

  // ==========================================
  // Webhook: stays public + signature-protected
  // ==========================================
  it('webhook route carries @Public() metadata and NO RequirePermission metadata', () => {
    const webhookHandler = PaymentController.prototype.handleTapWebhook;

    expect(reflector.get(REQUIRE_PERMISSION_KEY, webhookHandler)).toBeUndefined();
    expect(
      reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [webhookHandler, PaymentController]),
    ).toBe(true);
  });

  it('webhook guard check passes even WITHOUT an authenticated user (public bypass)', async () => {
    currentUser = undefined;

    await expect(
      guard.canActivate(contextFor(PaymentController.prototype.handleTapWebhook as never)),
    ).resolves.toBe(true);
  });

  it('webhook handler still delegates to the hashstring-verified service method', async () => {
    const body = { id: 'chg_test_1', status: 'CAPTURED' };

    const result = await controller.handleTapWebhook(body, 'hashstring-value');

    expect(walletService.handleTapWebhook).toHaveBeenCalledWith(body, 'hashstring-value');
    expect(result).toEqual({ received: true });
  });
});
