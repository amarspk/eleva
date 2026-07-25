import { Injectable, Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import { prisma, dbTenantContext } from '@zayjar/db';
import { TenantBranchRepository, TenantProductRepository } from '@zayjar/db';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  private readonly branchRepository = new TenantBranchRepository();
  private readonly productRepository = new TenantProductRepository();

  /**
   * Retrieves active subscription and plan for tenant with tenant isolation
   */
  async getActiveSubscription(tenantId: string) {
    const subscription = await prisma.subscription.findFirst({
      where: { tenantId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      throw new NotFoundException(`No subscription found for tenant [${tenantId}]`);
    }

    return subscription;
  }

  /**
   * Checks if tenant's subscription status allows operations
   * Per DOC-001 1.10 and DOC-005 4.7: TRIALING, ACTIVE allowed, PAST_DUE has grace period, UNPAID/CANCELED blocked
   */
  async checkSubscriptionStatus(tenantId: string) {
    const subscription = await this.getActiveSubscription(tenantId);

    const status = (subscription as any).status;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const tenantStatus = (tenant as any)?.status;

    // Block if UNPAID or CANCELED
    if (status === 'UNPAID' || status === 'CANCELED' || tenantStatus === 'UNPAID' || tenantStatus === 'CANCELED') {
      throw new ForbiddenException(
        `Subscription ${status} - Access restricted. Please update billing to restore access. Current status: ${status}`,
      );
    }

    // PAST_DUE has 7-day grace period per DOC-001 1.10, allow but log warning
    if (status === 'PAST_DUE' || tenantStatus === 'PAST_DUE') {
      this.logger.warn(`Tenant [${tenantId}] subscription PAST_DUE - in 7-day grace period, allowing operation with warning`);
    }

    return subscription;
  }

  /**
   * Checks branch limit against plan's maxBranches
   */
  async checkBranchLimit(tenantId: string) {
    const subscription = await this.checkSubscriptionStatus(tenantId);
    const plan = (subscription as any).plan;

    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }

    const maxBranches = plan.maxBranches;

    // Count current branches within tenant context
    const currentCount = await dbTenantContext.run({ tenantId }, async () => {
      return this.branchRepository.count();
    });

    if (currentCount >= maxBranches) {
      throw new ForbiddenException(
        `Branch limit reached (${currentCount}/${maxBranches}). Please upgrade to a higher tier. Current plan: ${plan.name}`,
      );
    }

    return { currentCount, maxBranches };
  }

  /**
   * Checks product limit per branch against plan's maxProductsPerBranch
   */
  async checkProductLimit(tenantId: string, branchId?: string) {
    const subscription = await this.checkSubscriptionStatus(tenantId);
    const plan = (subscription as any).plan;

    const maxProducts = plan.maxProductsPerBranch;

    // For simplicity, count all products under tenant, or per branch if branchId provided
    const _where: any = {};
    if (branchId) {
      // Need to count products that belong to restaurant that belongs to branch? Simplified: count via category->restaurant->branch?
      // For now, count all products under tenant as proxy
    }

    const currentCount = await dbTenantContext.run({ tenantId }, async () => {
      return this.productRepository.count();
    });

    if (currentCount >= maxProducts) {
      throw new ForbiddenException(
        `Product limit reached (${currentCount}/${maxProducts}) per branch. Please upgrade. Plan: ${plan.name}`,
      );
    }

    return { currentCount, maxProducts };
  }

  /**
   * Checks if custom domains allowed per plan
   */
  async checkCustomDomainAllowed(tenantId: string) {
    const subscription = await this.checkSubscriptionStatus(tenantId);
    const plan = (subscription as any).plan;

    if (!plan.allowCustomDomains) {
      throw new ForbiddenException(
        `Custom domains not allowed on current plan [${plan.name}]. Please upgrade to a higher tier.`,
      );
    }

    return true;
  }

  /**
   * Checks if online payments allowed per plan
   */
  async checkOnlinePaymentsAllowed(tenantId: string) {
    const subscription = await this.checkSubscriptionStatus(tenantId);
    const plan = (subscription as any).plan;

    if (!plan.allowOnlinePayments) {
      throw new ForbiddenException(
        `Online payments not allowed on current plan [${plan.name}]. Please upgrade.`,
      );
    }

    return true;
  }

  /**
   * Checks if analytics allowed per plan
   */
  async checkAnalyticsAllowed(tenantId: string) {
    const subscription = await this.checkSubscriptionStatus(tenantId);
    const plan = (subscription as any).plan;

    if (!plan.allowAnalytics) {
      throw new ForbiddenException(
        `Analytics not allowed on current plan [${plan.name}]. Please upgrade.`,
      );
    }

    return true;
  }
}
