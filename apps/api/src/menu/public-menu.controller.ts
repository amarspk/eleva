import { Controller, Get, Param, Query, Req, UseGuards, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { PublicMenuService, TableContextResponse, PublicMenuResponse } from './public-menu.service';
import { Public } from '../auth/decorators/public.decorator';
import { RateLimitGuard, RateLimit } from '../common/rate-limit/rate-limit.guard';
import { RequestWithTenant } from '../common/types/request.types';

/**
 * Unauthenticated guest surface for the QR Ordering Channel.
 *
 * DOC-001 1.2 — customers "scan a table's QR code, browse the menu, and
 * complete checkouts" without accounts.
 * DOC-003 3.6.1 — order placement supports an anonymous guest session token.
 * DOC-005 4.6 — the qrCodeToken is the cryptographic credential binding the
 * guest session to a physical table.
 *
 * These routes carry no JwtAuthGuard by design (guest access). They are:
 *  - explicitly marked @Public() so any future global auth guard bypasses them deliberately,
 *  - rate-limited on the 'public' tier (120 req/min per IP, DOC-006 5.6),
 *  - tenant-scoped by TenantContextMiddleware Host resolution (subdomain / custom domain).
 */
@Controller('api/v1/public')
@UseGuards(RateLimitGuard)
export class PublicMenuController {
  constructor(private readonly publicMenuService: PublicMenuService) {}

  /**
   * GET /api/v1/public/table/:token
   * Resolves table number, owning branch, restaurant currency and tenant
   * branding for the scanned QR token.
   */
  @Public()
  @Get('table/:token')
  @RateLimit('public')
  @HttpCode(HttpStatus.OK)
  async getTableContext(@Param('token') token: string, @Req() req: RequestWithTenant): Promise<TableContextResponse> {
    return this.publicMenuService.getTableContext(token, this.requireTenantContext(req));
  }

  /**
   * GET /api/v1/public/menu?token=...
   * Returns the complete guest menu (categories, products, sizes, variants,
   * addon groups with options) for the branch that owns the scanned table.
   */
  @Public()
  @Get('menu')
  @RateLimit('public')
  @HttpCode(HttpStatus.OK)
  async getPublicMenu(@Query('token') token: string, @Req() req: RequestWithTenant): Promise<PublicMenuResponse> {
    return this.publicMenuService.getPublicMenu(token, this.requireTenantContext(req));
  }

  /**
   * TenantContextMiddleware guarantees a resolved tenant on this surface
   * (it rejects contextless requests upstream). This guard is retained as a
   * fail-safe so the service never runs unscoped.
   */
  private requireTenantContext(req: RequestWithTenant): string {
    if (!req.tenantId) {
      throw new BadRequestException('Tenant context is required to resolve QR menu data.');
    }
    return req.tenantId;
  }
}
