import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@zayjar/db';
import { phase4Prisma } from '../common/phase4-prisma';

@Injectable()
export class PromotionService {
  private readonly logger = new Logger(PromotionService.name);

  async getConfig(tenantId: string): Promise<Record<string, unknown> | null> {
    const cfg = await phase4Prisma(prisma).welcomeOfferConfig.findUnique({ where: { tenantId } });
    if (!cfg) {return null;}
    return {
      enabled: cfg.enabled,
      discountType: cfg.discountType,
      discountValue: Number(cfg.discountValue),
      minOrderAmount: Number(cfg.minOrderAmount),
    };
  }

  async upsertConfig(tenantId: string, data: {
    enabled: boolean; discountType: string; discountValue: number; minOrderAmount?: number;
  }): Promise<Record<string, unknown>> {
    const cfg = await phase4Prisma(prisma).welcomeOfferConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...data, minOrderAmount: data.minOrderAmount ?? 0 },
      update: { ...data, minOrderAmount: data.minOrderAmount ?? 0 },
    });
    return {
      enabled: cfg.enabled,
      discountType: cfg.discountType,
      discountValue: Number(cfg.discountValue),
      minOrderAmount: Number(cfg.minOrderAmount),
    };
  }

  /** Customer eligibility: returns offer details if eligible, null otherwise. */
  async checkEligibility(customerId: string): Promise<{ eligible: boolean; offer?: { discountType: string; discountValue: number; minOrderAmount: number } }> {
    const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!customer) {return { eligible: false };}

    // Check existing redemption
    const existing = await phase4Prisma(prisma).welcomeRedemption.findUnique({ where: { customerId } });
    if (existing) {return { eligible: false };}

    // Check config exists and is enabled
    const cfg = await phase4Prisma(prisma).welcomeOfferConfig.findFirst({ where: { enabled: true } });
    if (!cfg) {return { eligible: false };}

    return {
      eligible: true,
      offer: { discountType: cfg.discountType, discountValue: Number(cfg.discountValue), minOrderAmount: Number(cfg.minOrderAmount) },
    };
  }
}
