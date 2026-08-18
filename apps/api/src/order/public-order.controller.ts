import { Controller, Post, Body, Req, HttpCode, HttpStatus, UseGuards, BadRequestException } from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderRequestDto } from './dto/create-order-request.dto';
import { Public } from '../auth/decorators/public.decorator';
import { RateLimitGuard, RateLimit } from '../common/rate-limit/rate-limit.guard';
import { RequestWithTenant } from '../common/types/request.types';

/**
 * Unauthenticated guest checkout surface for the QR Ordering Channel.
 *
 * DOC-001 1.2 — customers scan a table QR code, browse the menu and complete
 *               checkouts without accounts.
 * DOC-003 3.6.1 — order placement supports an anonymous guest session; the
 *               checkout tier is rate-limited (30 req/min per IP, DOC-006 5.6).
 * DOC-005 4.6 — the qrCodeToken is the cryptographic credential binding the
 *               guest session to a physical table; every guest order
 *               submission MUST verify it, and branch/table bindings are
 *               derived from the verified table row, never from the client.
 *
 * This route deliberately lives in the OrderModule (not the staff
 * OrderController): it carries no JwtAuthGuard/RBAC, is explicitly @Public(),
 * and only exposes the CreateOrderRequestDto contract. The global CsrfGuard
 * bypasses @Public() routes, so cookie-less guest POSTs are not blocked.
 */
@Controller('api/v1/public')
@UseGuards(RateLimitGuard)
export class PublicOrderController {
  constructor(private readonly orderService: OrderService) {}

  /**
   * POST /api/v1/public/orders/checkout
   * Places an order as an anonymous guest bound to the scanned table token.
   */
  @Public()
  @Post('orders/checkout')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit('checkout')
  async guestCheckout(@Body() dto: CreateOrderRequestDto, @Req() req: RequestWithTenant): Promise<unknown> {
    // Phase 4 — optional customer account: if the guest holds a customer
    // token, pass it so the order can be linked to their account (for their
    // own order history). Absent/invalid tokens keep pure guest checkout.
    const authHeader = req.headers?.authorization;
    const customerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    return this.orderService.createGuestOrder(dto, this.requireTenantContext(req), customerToken);
  }

  /**
   * TenantContextMiddleware guarantees a resolved tenant on this surface
   * (it rejects contextless requests upstream). This guard is retained as a
   * fail-safe so the guest pipeline never runs unscoped.
   */
  private requireTenantContext(req: RequestWithTenant): string {
    if (!req.tenantId) {
      throw new BadRequestException('Tenant context is required for guest checkout.');
    }
    return req.tenantId;
  }
}
