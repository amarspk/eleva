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
import { KdsModule } from './kds/kds.module';
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
import { AuditInterceptor } from './audit/audit.interceptor';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware';
import { CsrfModule } from './common/csrf/csrf.module';
import { CsrfGuard } from './common/csrf/csrf.guard';
import { SanitizationModule } from './common/sanitization/sanitization.module';
import { SanitizationMiddleware } from './common/sanitization/sanitization.middleware';
import { CorrelationIdMiddleware } from './common/logging/correlation-id.middleware';
import { HttpLoggingMiddleware } from './common/logging/http-logging.middleware';

@Module({
  imports: [EventEmitterModule.forRoot(), CacheModule, LoggingModule, HealthModule, CsrfModule, SanitizationModule, AuthModule, TenantModule, BranchModule, MenuModule, OrderModule, KdsModule, CustomerModule, BillingModule, AdminModule, AssetModule, WebhookModule, DeviceTokenModule, SubscriptionModule, AuditModule, PaymentModule, MediaModule],
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
  configure(consumer: MiddlewareConsumer): void {
    consumer
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
      .exclude('health')
      .forRoutes('*');
  }
}
