import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionService } from '../subscription.service';
import { AuthenticatedRequest } from '../../common/types/request.types';

export const SUBSCRIPTION_CHECK_KEY = 'subscriptionCheck';
export interface SubscriptionCheck {
  type: 'branch' | 'product' | 'customDomain' | 'onlinePayment' | 'analytics' | 'status';
}

export const RequireSubscriptionCheck = (type: SubscriptionCheck['type']): MethodDecorator => {
  return SetMetadata(SUBSCRIPTION_CHECK_KEY, { type });
};

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const check = this.reflector.getAllAndOverride<SubscriptionCheck>(SUBSCRIPTION_CHECK_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!check) {
      return true; // No subscription check required
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    const tenantId = user?.tenantId || request.tenantId || null;

    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing for subscription check');
    }

    // Always check overall subscription status first
    await this.subscriptionService.checkSubscriptionStatus(tenantId);

    // Then check specific limit type
    switch (check.type) {
      case 'branch':
        await this.subscriptionService.checkBranchLimit(tenantId);
        break;
      case 'product': {
        const branchId = request.body?.branchId || request.query?.branchId;
        await this.subscriptionService.checkProductLimit(tenantId, branchId);
        break;
      }
      case 'customDomain':
        await this.subscriptionService.checkCustomDomainAllowed(tenantId);
        break;
      case 'onlinePayment':
        await this.subscriptionService.checkOnlinePaymentsAllowed(tenantId);
        break;
      case 'analytics':
        await this.subscriptionService.checkAnalyticsAllowed(tenantId);
        break;
      case 'status':
        // Already checked
        break;
    }

    return true;
  }
}
