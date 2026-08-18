import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CacheModule } from './common/cache/cache.module';
import { LoggingModule } from './common/logging/logging.module';
import { HealthModule } from './common/health/health.module';
import { AuthModule } from './auth/auth.module';
import { TenantModule } from './tenant/tenant.module';
import { BranchModule } from './branch/branch.module';
import { MenuModule } from './menu/menu.module';
import { OrderModule } from './order/order.module';
import { ReceiptModule } from './receipt/receipt.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { PromotionModule } from './promotion/promotion.module';
import { WalletModule } from './wallet/wallet.module';
import { ComplaintModule } from './complaint/complaint.module';
import { RatingModule } from './rating/rating.module';
import { DesignModule } from './design/design.module';
import { KdsModule } from './kds/kds.module';
import { RestaurantModule } from './restaurant/restaurant.module';
import { CustomerModule } from './customer/customer.module';
import { BillingModule } from './billing/billing.module';
import { AdminModule } from './admin/admin.module';
import { AssetModule } from './asset/asset.module';
import { WebhookModule } from './webhook/webhook.module';
import { DeviceTokenModule } from './device-token/device-token.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { AuditModule } from './audit/audit.module';
import { PaymentModule } from './payment/payment.module';
import { MediaModule } from './media/media.module';
import { UserModule } from './user/user.module';
import { AuditInterceptor } from './audit/audit.interceptor';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware';
import { CsrfModule } from './common/csrf/csrf.module';
import { CsrfGuard } from './common/csrf/csrf.guard';
import { SanitizationModule } from './common/sanitization/sanitization.module';
import { SanitizationMiddleware } from './common/sanitization/sanitization.middleware';
import { CorrelationIdMiddleware } from './common/logging/correlation-id.middleware';
import { HttpLoggingMiddleware } from './common/logging/http-logging.middleware';
import { MetricsModule } from './common/metrics/metrics.module';
import { MetricsService } from './common/metrics/metrics.service';
import { createHttpMetricsMiddleware } from './common/metrics/metrics.middleware';

@Module({
  imports: [EventEmitterModule.forRoot(), CacheModule, LoggingModule, HealthModule, MetricsModule, CsrfModule, SanitizationModule, AuthModule, TenantModule, BranchModule, MenuModule, RestaurantModule, OrderModule, KdsModule, CustomerModule, BillingModule, AdminModule, AssetModule, WebhookModule, DeviceTokenModule, SubscriptionModule, AuditModule, PaymentModule, MediaModule, UserModule, DesignModule, ReceiptModule, LoyaltyModule, PromotionModule, WalletModule, ComplaintModule, RatingModule],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
  ],
})
export class AppModule implements NestModule {
  constructor(private readonly metricsService: MetricsService) {}

  configure(consumer: MiddlewareConsumer): void {
    consumer
      // AUDIT-023: HTTP metrics observation wraps every request before the
      // remaining middleware chain. The four infrastructure probe paths are
      // excluded so /metrics can never instrument itself and probes cannot
      // pollute the application signal.
      .apply(createHttpMetricsMiddleware(this.metricsService))
      .exclude(
        'health',
        'live',
        'ready',
        'metrics',
      )
      .forRoutes('*')
      .apply(CorrelationIdMiddleware)
      .forRoutes('*')
      .apply(HttpLoggingMiddleware)
      .forRoutes('*')
      .apply(SanitizationMiddleware)
      .forRoutes('*')
      .apply(TenantContextMiddleware)
      // H-2 (DEPLOY-002): '/health' is infrastructure-facing — Kubernetes
      // liveness/readiness probes and container healthchecks must reach the
      // health endpoint without tenant resolution. Excluded here at the
      // consumer level so the exemption is path-exact (only '/health') and
      // every other route keeps the full tenant fail-safe unchanged.
      // AUDIT-023: the same exemption now covers the new probe endpoints
      // '/live' and '/ready', and the token-gated '/metrics' endpoint —
      // infrastructure paths only, never application APIs.
      // Also excluded: tenant onboarding routes that must be accessible
      // without an existing tenant context (signup, plan listing).
      // Login is excluded so Platform Owners (tenantId=null) can authenticate
      // without a tenant context. The login handler enforces its own tenant
      // scoping via X-Tenant-ID header or DTO — tenant-free login simply
      // returns a JWT with tenantId=null which the middleware will accept
      // on subsequent authenticated requests (isPlatformOwner=true).
      //
      // A1: the public platform-design endpoint is also tenant-free. It returns
      // only the published projection; draft preview and both mutations remain
      // JWT-protected and PLATFORM_OWNER-only in DesignController. A4 adds the
      // standard /api/v1 alias, so both exact public paths are exempted.
      // AUDIT-011: documentation is platform-level, never tenant-scoped. Only
      // the two configured docs routes and their Swagger UI asset namespace are
      // excluded; the access middleware still requires PLATFORM_OWNER JWT auth.
      // Phase 4 P0 (manual gate finding): the password-reset / email-verification
      // flows are @Public() account-recovery endpoints that must be reachable
      // WITHOUT a tenant context — same rationale as login. Their handlers
      // (requestPasswordReset / resetPassword / verifyEmail) establish their own
      // platform-scoped dbTenantContext internally, so excluding the routes here
      // is safe and makes the documented enumeration-resistant generic response
      // actually reachable instead of being pre-empted by the middleware 403.
      .exclude(
        'health',
        'live',
        'ready',
        'metrics',
        'api/v1/tenants/plans',
        'api/v1/tenants',
        'api/v1/auth/login',
        'api/v1/auth/forgot-password',
        'api/v1/auth/reset-password',
        'api/v1/auth/verify-email',
        'design/platform',
        'api/v1/design/platform',
        'api/docs',
        'api/docs-json',
        'api/docs/(.*)',
      )
      .forRoutes('*');
  }
}
