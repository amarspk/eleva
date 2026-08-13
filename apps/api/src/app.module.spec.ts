import { AppModule } from './app.module';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware';
import { CorrelationIdMiddleware } from './common/logging/correlation-id.middleware';
import { HttpLoggingMiddleware } from './common/logging/http-logging.middleware';
import { SanitizationMiddleware } from './common/sanitization/sanitization.middleware';

/**
 * H-2 (DEPLOY-002) wiring regression guard — extended 2026-08-10 to the
 * current verified contract.
 *
 * Verifies the middleware consumer configuration declaratively: the tenant
 * fail-safe (TenantContextMiddleware) must exempt EXACTLY the infra + public
 * tenant-free paths — 'health' (infrastructure probes, H-2/DEPLOY-002),
 * 'api/v1/tenants/plans' + 'api/v1/tenants' (public onboarding/signup and
 * plan listing — added ea8da7d so self-service signup works without an
 * existing tenant context), 'api/v1/auth/login' (added ec48f11 so Platform
 * Owners with tenantId=null can authenticate), and A1's exact public
 * 'design/platform' published projection — no more, no less. Draft preview
 * and platform mutations are deeper, protected routes and are not exempted.
 * The onboarding/login flows were runtime-verified (RT-ONB-001, Sprint 2
 * Task 1); this spec pins the complete middleware wiring.
 */
interface MiddlewareSegmentRecord {
  middlewares: unknown[];
  excluded: string[];
  routes: unknown[];
}

describe('AppModule middleware wiring (H-2/DEPLOY-002)', () => {
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
    new AppModule().configure(consumer as any);
    return calls;
  }

  it('applies exactly four middleware segments in the standing order', () => {
    const calls = captureWiring();
    expect(calls).toHaveLength(4);
    expect(calls[0].middlewares).toEqual([CorrelationIdMiddleware]);
    expect(calls[1].middlewares).toEqual([HttpLoggingMiddleware]);
    expect(calls[2].middlewares).toEqual([SanitizationMiddleware]);
    expect(calls[3].middlewares).toEqual([TenantContextMiddleware]);
  });

  it('exempts EXACTLY the infra + public tenant-free paths from the tenant fail-safe, served on all other routes', () => {
    const calls = captureWiring();
    const tenantSegment = calls[3];
    // path-exact: no wildcards, no deeper paths
    expect(tenantSegment.excluded).toEqual([
      'health',
      'api/v1/tenants/plans',
      'api/v1/tenants',
      'api/v1/auth/login',
      'design/platform',
    ]);
    expect(tenantSegment.routes).toEqual(['*']);
  });

  it('keeps every other middleware segment exemption-free (protection unchanged)', () => {
    const calls = captureWiring();
    for (const seg of calls.slice(0, 3)) {
      expect(seg.excluded).toEqual([]);
      expect(seg.routes).toEqual(['*']);
    }
  });

  it('is the ONLY exemption in the entire consumer configuration', () => {
    const calls = captureWiring();
    const allExclusions = calls.flatMap((c) => c.excluded);
    expect(allExclusions).toEqual([
      'health',
      'api/v1/tenants/plans',
      'api/v1/tenants',
      'api/v1/auth/login',
      'design/platform',
    ]);
  });
});
