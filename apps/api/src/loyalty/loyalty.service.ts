import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { prisma, dbTenantContext } from '@zayjar/db';
import { phase4Prisma } from '../common/phase4-prisma';

const LOYALTY_TX_TYPES = {
  EARNED: 'EARNED',
  REDEEMED: 'REDEEMED',
  ADJUSTMENT: 'ADJUSTMENT',
  EXPIRED: 'EXPIRED',
} as const;

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  /** Returns the tenant's loyalty rule (or null if not configured). */
  async getRule(tenantId: string): Promise<Record<string, unknown> | null> {
    const rule = await dbTenantContext.run({ tenantId }, () =>
      phase4Prisma(prisma).loyaltyRule.findUnique({ where: { tenantId } }),
    );
    if (!rule) {return null;}
    return {
      id: rule.id,
      earnRate: Number(rule.earnRate),
      earnMinOrderAmount: Number(rule.earnMinOrderAmount),
      minRedeemPoints: rule.minRedeemPoints,
      redeemRate: Number(rule.redeemRate),
    };
  }

  /** Creates or updates the tenant's loyalty rule. Staff-only surface. */
  async upsertRule(
    tenantId: string,
    data: { earnRate: number; earnMinOrderAmount?: number; minRedeemPoints?: number; redeemRate: number },
  ): Promise<Record<string, unknown>> {
    return dbTenantContext.run({ tenantId }, async () => {
      const rule = await phase4Prisma(prisma).loyaltyRule.upsert({
        where: { tenantId },
        create: {
          tenantId,
          earnRate: data.earnRate,
          earnMinOrderAmount: data.earnMinOrderAmount ?? 0,
          minRedeemPoints: data.minRedeemPoints ?? 0,
          redeemRate: data.redeemRate,
        },
        update: {
          earnRate: data.earnRate,
          earnMinOrderAmount: data.earnMinOrderAmount ?? 0,
          minRedeemPoints: data.minRedeemPoints ?? 0,
          redeemRate: data.redeemRate,
        },
      });
      return {
        id: rule.id,
        earnRate: Number(rule.earnRate),
        earnMinOrderAmount: Number(rule.earnMinOrderAmount),
        minRedeemPoints: rule.minRedeemPoints,
        redeemRate: Number(rule.redeemRate),
      };
    });
  }

  /** Customer self-service: current balance. */
  async getBalance(customerId: string): Promise<{ balance: number }> {
    const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { loyaltyPoints: true } });
    if (!customer) {throw new NotFoundException('Customer not found.');}
    return { balance: customer.loyaltyPoints };
  }

  /** Customer self-service: transaction history (own orders only, tenant-scoped). */
  async getHistory(customerId: string): Promise<Array<Record<string, unknown>>> {
    const txs = await prisma.loyaltyTransaction.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return txs.map((tx) => ({
      id: tx.id,
      type: tx.type,
      points: tx.points,
      balanceAfter: tx.balanceAfter,
      description: tx.description,
      orderId: tx.orderId,
      createdAt: tx.createdAt.toISOString(),
    }));
  }

  /** Customer self-service: redeem points for a one-time discount code. */
  async redeem(customerId: string, points: number): Promise<{
    success: boolean;
    discountCode: string;
    discountValue: number;
    balanceAfter: number;
  }> {
    const tenantId = dbTenantContext.getStore()?.tenantId;
    if (!tenantId) {throw new ForbiddenException('Tenant context required.');}

    return dbTenantContext.run({ tenantId }, async () => {
      const rule = await phase4Prisma(prisma).loyaltyRule.findUnique({ where: { tenantId } });
      if (!rule || Number(rule.redeemRate) <= 0) {
        throw new BadRequestException('Loyalty redemption is not configured for this restaurant.');
      }
      if (Number(rule.minRedeemPoints) > 0 && points < Number(rule.minRedeemPoints)) {
        throw new BadRequestException(`Minimum redemption is ${String(rule.minRedeemPoints)} points.`);
      }
      const discountValue = Number((points * Number(rule.redeemRate)).toFixed(2));
      if (discountValue <= 0) {
        throw new BadRequestException('The selected points produce no discount value.');
      }

      // Transaction: update balance, create transactions, generate discount code
      return phase4Prisma(prisma).$transaction(async (tx) => {
        const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { loyaltyPoints: true } });
        if (!customer) {throw new NotFoundException('Customer not found.');}
        if (Number(customer.loyaltyPoints) < points) {
          throw new BadRequestException('Insufficient loyalty balance.');
        }

        const code = `LOYALTY-${customerId.slice(0, 8)}-${Date.now().toString(36).toUpperCase()}`;
        const balanceAfter = Number(customer.loyaltyPoints) - points;

        // Create redemption discount (1-time use, 7-day validity)
        await tx.discount.create({
          data: {
            tenantId,
            code,
            name: `Loyalty redemption — ${points} pts`,
            type: 'FIXED',
            value: discountValue,
            active: true,
            validFrom: new Date(),
            validTo: new Date(Date.now() + 7 * 86400_000),
            usageLimit: 1,
            usageCount: 0,
          },
        });

        // Update customer balance
        await tx.customer.update({
          where: { id: customerId },
          data: { loyaltyPoints: balanceAfter },
        });

        // Record transaction
        await tx.loyaltyTransaction.create({
          data: {
            tenantId,
            customerId,
            type: LOYALTY_TX_TYPES.REDEEMED,
            points: -points,
            balanceAfter,
            description: `Redeemed for discount code ${code} (${discountValue.toFixed(2)} value)`,
          },
        });

        return { success: true, discountCode: code, discountValue, balanceAfter };
      });
    });
  }

  /**
   * Awards loyalty points for a completed order (called from OrderService).
   * Idempotent: if a EARNED transaction already exists for this order, skip.
   * Atomic: single DB transaction.
   */
  async awardPointsForOrder(tenantId: string, orderId: string, customerId: string, orderTotal: number): Promise<void> {
    if (!customerId) {return;}

    await dbTenantContext.run({ tenantId }, async () => {
      const existing = await prisma.loyaltyTransaction.findFirst({
        where: { orderId, type: LOYALTY_TX_TYPES.EARNED },
      });
      if (existing) {
        this.logger.warn(`Loyalty points already awarded for order [${orderId}]; skipping duplicate.`);
        return;
      }

      const rule = await phase4Prisma(prisma).loyaltyRule.findUnique({ where: { tenantId } });
      if (!rule || Number(rule.earnRate) <= 0) {return;} // No rule → no points

      if (orderTotal < Number(rule.earnMinOrderAmount)) {return;}

      const points = Math.floor(orderTotal * Number(rule.earnRate));
      if (points <= 0) {return;}

      await phase4Prisma(prisma).$transaction(async (tx) => {
        const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { loyaltyPoints: true } });
        if (!customer) {return;}

        const balanceAfter = Number(customer.loyaltyPoints) + points;
        await tx.customer.update({
          where: { id: customerId },
          data: { loyaltyPoints: balanceAfter },
        });
        await tx.loyaltyTransaction.create({
          data: {
            tenantId,
            customerId,
            orderId,
            type: LOYALTY_TX_TYPES.EARNED,
            points,
            balanceAfter,
            description: `Earned from order completion (rate: ${Number(rule.earnRate)} pts/currency)`,
          },
        });
      });
    });
  }
}