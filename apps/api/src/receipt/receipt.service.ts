import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { prisma, dbTenantContext } from '@zayjar/db';
import { resolveReceiptConfig } from '@zayjar/receipts/receipt-config';
import type { ReceiptConfig } from '@zayjar/receipts/receipt-types';

interface HydratedOrderItem {
  id: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  product: { name: string };
  size: { name: string } | null;
  variant: { name: string } | null;
  orderItemAddons: Array<{ addonItem: { name: string } }>;
}

/**
 * Receipt data assembly (Phase 4 P3 — Printing & Receipts).
 *
 * Returns the server-assembled data needed to print a customer receipt or a
 * kitchen ticket: the real order with hydrated item names/sizes/add-ons, the
 * branch, the tenant branding, and the published receipt design config.
 *
 * Isolation is enforced here exactly like the other staff surfaces:
 *   - the order lookup is tenant-scoped (the tenant-scoped repository);
 *   - branch-scoped staff (P0) may only access orders in their assigned
 *     branches (same guard idiom as OrderService/KdsService).
 */
@Injectable()
export class ReceiptService {
  /** Same branch-scoping idiom used by OrderService and KdsService (P0). */
  private assertBranchAllowed(userBranches: string[] | undefined, branchId: string): void {
    if (userBranches && userBranches.length > 0 && !userBranches.includes(branchId)) {
      throw new ForbiddenException(
        `Access denied: you do not have permission to operate on branch [${branchId}].`,
      );
    }
  }

  async getReceiptData(orderId: string, userBranches?: string[]): Promise<Record<string, unknown>> {
    // 1. Order lookup. findUnique is NOT ALS-scoped — a tenant-wide staff
    // JWT (empty branches) would otherwise return any tenant's order by UUID.
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    const requestTenantId = dbTenantContext.getStore()?.tenantId;
    if (!order || !requestTenantId || order.tenantId !== requestTenantId) {
      throw new NotFoundException(`Order with ID [${orderId}] was not found.`);
    }

    // 2. Branch isolation (P0) — branch-scoped staff cannot read foreign branches.
    this.assertBranchAllowed(userBranches, order.branchId);

    // 3. Hydrate items with names (product/size/variant/add-on) — same shape
    //    the KDS ticket hydration uses.
    const hydrated = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        type: true,
        status: true,
        paymentMethod: true,
        subtotal: true,
        taxAmount: true,
        discountAmount: true,
        total: true,
        specialNotes: true,
        createdAt: true,
        branch: {
          select: {
            name: true,
            address: true,
            phoneNumber: true,
            restaurant: { select: { name: true, currency: true } },
          },
        },
        orderItems: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            totalPrice: true,
            product: { select: { name: true } },
            size: { select: { name: true } },
            variant: { select: { name: true } },
            orderItemAddons: { select: { addonItem: { select: { name: true } } } },
          },
        },
      },
    });

    if (!hydrated) {
      throw new NotFoundException(`Order with ID [${orderId}] was not found.`);
    }

    // 4. Tenant branding (name/logo/primary color) — Tenant is globally
    //    readable inside the ORM extension; this is a strict whitelist.
    const tenant = await prisma.tenant.findUnique({
      where: { id: order.tenantId },
      select: { name: true, logoUrl: true, primaryColor: true },
    });

    // 5. Published receipt design config from the existing TenantDesign
    //    JSONB (no new tables). Falls back to defaults when unset.
    const design = await (prisma as any).tenantDesign.findUnique({
      where: { tenantId: order.tenantId },
      select: { published: true },
    });
    const published = design?.published as Record<string, unknown> | undefined;
    const config: ReceiptConfig = resolveReceiptConfig(
      (published?.receipt as Record<string, unknown> | undefined) ?? undefined,
    );

    const items = (hydrated.orderItems as unknown as HydratedOrderItem[]).map((item) => ({
      name: item.product.name,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      totalPrice: Number(item.totalPrice),
      size: item.size?.name ?? null,
      variant: item.variant?.name ?? null,
      addons: (item.orderItemAddons ?? [])
        .map((a) => a.addonItem.name)
        .filter((n): n is string => Boolean(n)),
    }));

    return {
      config,
      tenant: {
        name: tenant?.name ?? '',
        logoUrl: tenant?.logoUrl ?? null,
        primaryColor: tenant?.primaryColor ?? null,
        currency: hydrated.branch.restaurant.currency,
      },
      branch: {
        name: hydrated.branch.name,
        address: hydrated.branch.address,
        phoneNumber: hydrated.branch.phoneNumber,
      },
      order: {
        id: hydrated.id,
        orderNumber: hydrated.orderNumber,
        type: hydrated.type,
        status: hydrated.status,
        paymentMethod: hydrated.paymentMethod,
        subtotal: Number(hydrated.subtotal),
        taxAmount: Number(hydrated.taxAmount),
        discountAmount: Number(hydrated.discountAmount),
        total: Number(hydrated.total),
        specialNotes: hydrated.specialNotes,
        createdAt: hydrated.createdAt.toISOString(),
        items,
      },
    };
  }
}