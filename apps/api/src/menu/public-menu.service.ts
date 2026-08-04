import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { prisma, dbTenantContext } from '@zayjar/db';

// ==========================================
// Public QR Menu Response DTOs (safe projections only)
// DOC-001 1.2 — guest-facing read model
// Internal fields (tenantId, stripeCustomerId, timestamps,
// soft-delete markers) are never exposed on this surface.
// ==========================================

export interface PublicTenantBranding {
  name: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
}

export interface PublicTableContext {
  number: string;
}

export interface PublicBranchContext {
  id: string;
  name: string;
}

export interface PublicRestaurantContext {
  name: string;
  currency: string;
}

export interface PublicAddonOption {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
}

export interface PublicAddonGroup {
  id: string;
  name: string;
  minSelections: number;
  maxSelections: number;
  options: PublicAddonOption[];
}

export interface PublicProductSize {
  id: string;
  name: string;
  priceAdjustment: number;
}

export interface PublicProductVariant {
  id: string;
  name: string;
  price: number;
  stockQuantity: number;
}

export interface PublicProduct {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  basePrice: number;
  calories: number | null;
  preparationTime: number;
  isAvailable: boolean;
  sizes: PublicProductSize[];
  variants: PublicProductVariant[];
  addons: PublicAddonGroup[];
}

export interface PublicCategory {
  id: string;
  name: string;
  products: PublicProduct[];
}

export interface TableContextResponse {
  table: PublicTableContext;
  branch: PublicBranchContext;
  restaurant: PublicRestaurantContext;
  tenant: PublicTenantBranding;
}

export interface PublicMenuResponse {
  table: PublicTableContext;
  branch: PublicBranchContext;
  restaurant: PublicRestaurantContext;
  tenant: PublicTenantBranding;
  categories: PublicCategory[];
}

interface ResolvedTable {
  table: {
    id: string;
    number: string;
    branchId: string;
  };
  branch: {
    id: string;
    name: string;
    restaurantId: string;
  };
  restaurant: {
    name: string;
    currency: string;
  };
}

interface TenantWithBranding {
  name: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  status: string;
}

@Injectable()
export class PublicMenuService {
  private readonly logger = new Logger(PublicMenuService.name);

  /**
   * Upper bound on categories returned by the public guest menu.
   * Well above any realistic restaurant menu; exists to bound the worst case
   * on an unauthenticated, high-traffic endpoint.
   */
  private static readonly MAX_CATEGORIES = 100;

  /** Upper bound on products returned per category (same rationale). */
  private static readonly MAX_PRODUCTS_PER_CATEGORY = 200;

  /**
   * DOC-005 4.6 — Resolves seating table context for a guest scanning a QR code.
   * The qrCodeToken is the sole credential on this surface: it must match a
   * table row belonging to the tenant resolved by TenantContextMiddleware.
   * Invalid tokens receive a uniform 404 (no existence oracle).
   */
  async getTableContext(token: string, tenantId: string): Promise<TableContextResponse> {
    this.logger.log(`Resolving public QR table context for tenant [${tenantId}]`);
    return dbTenantContext.run({ tenantId }, async () => {
      const resolved = await this.resolveTableByToken(token);
      const tenant = await this.getTenantRecord(tenantId);
      this.assertGuestOrderingAllowed(tenant.status);

      return {
        table: { number: resolved.table.number },
        branch: { id: resolved.branch.id, name: resolved.branch.name },
        restaurant: { name: resolved.restaurant.name, currency: resolved.restaurant.currency },
        tenant: this.toBranding(tenant),
      };
    });
  }

  /**
   * DOC-001 1.3 / DOC-005 4.6 — Full guest menu for the branch that owns the
   * scanned table. The token is verified first; only active, non-deleted,
   * available records are returned, assembled in a single relational roundtrip.
   */
  async getPublicMenu(token: string, tenantId: string): Promise<PublicMenuResponse> {
    this.logger.log(`Resolving public QR menu for tenant [${tenantId}]`);
    return dbTenantContext.run({ tenantId }, async () => {
      const resolved = await this.resolveTableByToken(token);
      const tenant = await this.getTenantRecord(tenantId);
      this.assertGuestOrderingAllowed(tenant.status);

      // Bounded fan-out (production-readiness audit).
      //
      // This is the busiest UNAUTHENTICATED endpoint on the platform: every QR
      // scan hits it. It previously loaded every category, every product, and
      // each product's sizes/variants/addons/addon-items with no limit, so the
      // payload grew linearly with catalogue size — runtime-measured 5 KB at 13
      // products vs 177 KB at 813 products (810 products serialized in one
      // response). A tenant with a large catalogue therefore degrades API
      // memory, bandwidth and mobile render time for every guest, and the cost
      // is reachable without credentials.
      //
      // The caps below are far above any realistic single-restaurant menu
      // (PublicMenuService.MAX_* ) and exist to bound the worst case rather
      // than to paginate: a menu that exceeds them is a data-quality problem,
      // not a browsing pattern.
      const categories = await prisma.category.findMany({
        where: {
          restaurantId: resolved.branch.restaurantId,
          isActive: true,
          deletedAt: null,
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        take: PublicMenuService.MAX_CATEGORIES,
        select: {
          id: true,
          name: true,
          products: {
            where: {
              isAvailable: true,
              deletedAt: null,
            },
            orderBy: { name: 'asc' },
            take: PublicMenuService.MAX_PRODUCTS_PER_CATEGORY,
            select: {
              id: true,
              name: true,
              description: true,
              imageUrl: true,
              basePrice: true,
              calories: true,
              preparationTime: true,
              isAvailable: true,
              productSizes: {
                select: { id: true, name: true, priceAdjustment: true },
              },
              productVariants: {
                select: { id: true, name: true, price: true, stockQuantity: true },
              },
              productAddons: {
                select: {
                  id: true,
                  name: true,
                  minSelections: true,
                  maxSelections: true,
                  addonItems: {
                    where: { isAvailable: true },
                    select: { id: true, name: true, price: true, isAvailable: true },
                  },
                },
              },
            },
          },
        },
      });

      const mapped: PublicCategory[] = categories
        .map((category) => ({
          id: category.id,
          name: category.name,
          products: category.products.map((product) => ({
            id: product.id,
            name: product.name,
            description: product.description,
            imageUrl: product.imageUrl,
            basePrice: Number(product.basePrice),
            calories: product.calories,
            preparationTime: product.preparationTime,
            isAvailable: product.isAvailable,
            sizes: product.productSizes.map((size) => ({
              id: size.id,
              name: size.name,
              priceAdjustment: Number(size.priceAdjustment),
            })),
            variants: product.productVariants.map((variant) => ({
              id: variant.id,
              name: variant.name,
              price: Number(variant.price),
              stockQuantity: variant.stockQuantity,
            })),
            addons: product.productAddons.map((group) => ({
              id: group.id,
              name: group.name,
              minSelections: group.minSelections,
              maxSelections: group.maxSelections,
              options: group.addonItems.map((item) => ({
                id: item.id,
                name: item.name,
                price: Number(item.price),
                isAvailable: item.isAvailable,
              })),
            })),
          })),
        }))
        .filter((category) => category.products.length > 0);

      return {
        table: { number: resolved.table.number },
        branch: { id: resolved.branch.id, name: resolved.branch.name },
        restaurant: { name: resolved.restaurant.name, currency: resolved.restaurant.currency },
        tenant: this.toBranding(tenant),
        categories: mapped,
      };
    });
  }

  /**
   * Verifies the QR token against the tables of the resolved tenant and
   * returns the owning branch and restaurant context. A mismatched,
   * unknown, or deactivated token always produces the same 404 —
   * tokens are never enumerable through this surface.
   */
  private async resolveTableByToken(token: string): Promise<ResolvedTable> {
    if (!token || token.trim().length === 0) {
      throw new NotFoundException('The scanned QR code could not be resolved.');
    }

    const table = await prisma.table.findFirst({
      where: { qrCodeToken: token, deletedAt: null },
      select: { id: true, number: true, branchId: true },
    });
    if (!table) {
      this.logger.warn('Public QR resolution failed: no table matched the provided token.');
      throw new NotFoundException('The scanned QR code could not be resolved.');
    }

    const branch = await prisma.branch.findFirst({
      where: { id: table.branchId, isActive: true, deletedAt: null },
      select: { id: true, name: true, restaurantId: true },
    });
    if (!branch) {
      this.logger.warn(`Public QR resolution failed: branch [${table.branchId}] is unavailable.`);
      throw new NotFoundException('The scanned QR code is currently unavailable.');
    }

    const restaurant = await prisma.restaurant.findFirst({
      where: { id: branch.restaurantId },
      select: { name: true, currency: true },
    });
    if (!restaurant) {
      this.logger.error(`Public QR resolution failed: restaurant [${branch.restaurantId}] missing.`);
      throw new NotFoundException('The scanned QR code is currently unavailable.');
    }

    return { table, branch, restaurant };
  }

  /**
   * Loads tenant branding via a strict field whitelist. The Tenant model is
   * globally readable inside the ORM extension, but this projection is the
   * only public view of it.
   */
  private async getTenantRecord(tenantId: string): Promise<TenantWithBranding> {
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required to resolve QR menu data.');
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        logoUrl: true,
        bannerUrl: true,
        primaryColor: true,
        secondaryColor: true,
        status: true,
      },
    });
    if (!tenant) {
      this.logger.error(`Public QR resolution failed: tenant [${tenantId}] missing after middleware resolution.`);
      throw new NotFoundException('The requested restaurant could not be resolved.');
    }
    return tenant as TenantWithBranding;
  }

  /**
   * DOC-001 1.10 — Subscription lifecycle enforcement on the guest channel:
   * UNPAID pauses guest ordering, CANCELED disables core access.
   * TRIALING / ACTIVE / PAST_DUE (grace period) remain fully accessible.
   */
  private assertGuestOrderingAllowed(status: string): void {
    if (status === 'UNPAID' || status === 'CANCELED') {
      this.logger.warn(`Public QR access blocked: tenant subscription status is [${status}].`);
      throw new ForbiddenException('Online ordering is temporarily unavailable for this restaurant.');
    }
  }

  private toBranding(tenant: TenantWithBranding): PublicTenantBranding {
    return {
      name: tenant.name,
      logoUrl: tenant.logoUrl,
      bannerUrl: tenant.bannerUrl,
      primaryColor: tenant.primaryColor,
      secondaryColor: tenant.secondaryColor,
    };
  }
}
