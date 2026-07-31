import { AppModule } from './app.module';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware';
import { CorrelationIdMiddleware } from './common/logging/correlation-id.middleware';
import { HttpLoggingMiddleware } from './common/logging/http-logging.middleware';
import { SanitizationMiddleware } from './common/sanitization/sanitization.middleware';

/**
 * H-2 (DEPLOY-002) wiring regression guard.
 *
 * Verifies the middleware consumer configuration declaratively: the tenant
 * fail-safe (TenantContextMiddleware) must exempt EXACTLY the infrastructure
 * health path ('health') — no more, no less — while every other middleware
 * segment keeps running unexempted on all routes. This protects the fix's
 * two mandated properties at unit level:
 *   1. '/health' is reachable without tenant resolution (infra probes), and
 *   2. tenant protection for every other endpoint is preserved unchanged.
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

  it('exempts EXACTLY the health path from the tenant fail-safe, served on all other routes', () => {
    const calls = captureWiring();
    const tenantSegment = calls[3];
    expect(tenantSegment.excluded).toEqual(['health']); // path-exact: no wildcards, no deeper paths
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
    expect(allExclusions).toEqual(['health']);
  });
});
