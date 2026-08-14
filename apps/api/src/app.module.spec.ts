import { AppModule } from './app.module';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware';
import { CorrelationIdMiddleware } from './common/logging/correlation-id.middleware';
import { HttpLoggingMiddleware } from './common/logging/http-logging.middleware';
import { SanitizationMiddleware } from './common/sanitization/sanitization.middleware';
import { MetricsService } from './common/metrics/metrics.service';

/**
 * H-2 (DEPLOY-002) wiring regression guard — extended 2026-08-10 to the
 * current verified contract, and again for AUDIT-023.
 *
 * Verifies the middleware consumer configuration declaratively: the tenant
 * fail-safe (TenantContextMiddleware) must exempt EXACTLY the infra + public
 * tenant-free paths — 'health' (infrastructure probes, H-2/DEPLOY-002),
 * plus AUDIT-023's 'live', 'ready' and 'metrics' (infrastructure probes and
 * the token-gated metrics endpoint, which must never be tenant-scoped),
 * 'api/v1/tenants/plans' + 'api/v1/tenants' (public onboarding/signup and
 * plan listing — added ea8da7d so self-service signup works without an
 * existing tenant context), 'api/v1/auth/login' (added ec48f11 so Platform
 * Owners with tenantId=null can authenticate), and A1's exact public
 * 'design/platform' published projection plus A4's standard API alias
 * 'api/v1/design/platform', plus AUDIT-011's platform-level documentation
 * routes (`api/docs`, `api/docs-json`, and only the Swagger asset namespace).
 * Draft preview and platform mutations are deeper, protected routes and are
 * not exempted.
 *
 * AUDIT-023 adds a first segment: the HTTP metrics middleware, which must
 * exempt EXACTLY the four infrastructure probe paths (so /metrics can never
 * instrument itself) and observe every other route.
 *
 * The onboarding/login flows were runtime-verified (RT-ONB-001, Sprint 2
 * Task 1); this spec pins the complete middleware wiring.
 */
interface MiddlewareSegmentRecord {
  middlewares: unknown[];
  excluded: string[];
  routes: unknown[];
}

describe('AppModule middleware wiring (H-2/DEPLOY-002 + AUDIT-023)', () => {
  function captureWiring(): MiddlewareSegmentRecord[] {
    const calls: MiddlewareSegmentRecord[] = [];
    let current: MiddlewareSegmentRecord | null = null;

    const segment = {
      exclude: (...paths: string[]) => {
        (current as MiddlewareSegmentRecord).excluded.push(...paths);
        return segment;
      },
      forRoutes: (...routes: unknown[]) => {
        (current as MiddlewareSegmentRecord).routes.push(...routes);
        return consumer;
      },
    };
    const consumer = {
      apply: (...middlewares: unknown[]) => {
        current = { middlewares, excluded: [], routes: [] };
        calls.push(current);
        return segment;
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new AppModule(new MetricsService()).configure(consumer as any);
    return calls;
  }

  it('applies exactly five middleware segments in the standing order', () => {
    const calls = captureWiring();
    expect(calls).toHaveLength(5);
    expect(calls[0].middlewares).toHaveLength(1);
    expect(typeof calls[0].middlewares[0]).toBe('function'); // AUDIT-023 HTTP metrics middleware
    expect(calls[1].middlewares).toEqual([CorrelationIdMiddleware]);
    expect(calls[2].middlewares).toEqual([HttpLoggingMiddleware]);
    expect(calls[3].middlewares).toEqual([SanitizationMiddleware]);
    expect(calls[4].middlewares).toEqual([TenantContextMiddleware]);
  });

  it('exempts EXACTLY the infra + public tenant-free paths from the tenant fail-safe, served on all other routes', () => {
    const calls = captureWiring();
    const tenantSegment = calls[4];
    // path-exact: no wildcards, no deeper paths
    expect(tenantSegment.excluded).toEqual([
      'health',
      'live',
      'ready',
      'metrics',
      'api/v1/tenants/plans',
      'api/v1/tenants',
      'api/v1/auth/login',
      'design/platform',
      'api/v1/design/platform',
      'api/docs',
      'api/docs-json',
      'api/docs/(.*)',
    ]);
    expect(tenantSegment.routes).toEqual(['*']);
  });

  it('exempts EXACTLY the four infrastructure probe paths from metrics instrumentation', () => {
    const calls = captureWiring();
    const metricsSegment = calls[0];
    expect(metricsSegment.excluded).toEqual(['health', 'live', 'ready', 'metrics']);
    expect(metricsSegment.routes).toEqual(['*']);
  });

  it('keeps every other middleware segment exemption-free (protection unchanged)', () => {
    const calls = captureWiring();
    for (const seg of calls.slice(1, 4)) {
      expect(seg.excluded).toEqual([]);
      expect(seg.routes).toEqual(['*']);
    }
  });

  it('contains no exemption beyond the metrics probe paths and the tenant fail-safe list', () => {
    const calls = captureWiring();
    const allExclusions = calls.flatMap((c) => c.excluded);
    expect(allExclusions).toEqual([
      'health',
      'live',
      'ready',
      'metrics',
      'health',
      'live',
      'ready',
      'metrics',
      'api/v1/tenants/plans',
      'api/v1/tenants',
      'api/v1/auth/login',
      'design/platform',
      'api/v1/design/platform',
      'api/docs',
      'api/docs-json',
      'api/docs/(.*)',
    ]);
  });
});
