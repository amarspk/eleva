import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { MetricsService } from './metrics.service';

/**
 * AUDIT-023 — HTTP metrics middleware (functional; one instance per app).
 *
 * Instrumentation rules:
 * - The in-flight gauge is incremented at entry (method label only) and
 *   decremented exactly once when the response finishes or the connection
 *   closes, whichever happens first.
 * - The counter and duration histogram are recorded at response
 *   finish/close. The route label comes ONLY from the matched Express route
 *   template (`req.route.path`, e.g. '/api/v1/public/table/:token'), which
 *   is populated once the Express route layer has dispatched — Nest
 *   middleware itself runs before that dispatch. Raw URLs, query strings,
 *   authorization tokens, cookies and ids are never read for labeling, so
 *   no tenant/user/order id or uuid can ever appear in the exposition.
 * - The four infrastructure probe paths are never instrumented, so
 *   GET /metrics can never count itself and probes cannot pollute the
 *   application signal.
 */
export const METRICS_EXEMPT_PATHS = new Set(['/health', '/live', '/ready', '/metrics']);

export function createHttpMetricsMiddleware(metrics: MetricsService): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (METRICS_EXEMPT_PATHS.has(req.path)) {
      next();
      return;
    }
    const method = req.method || 'UNKNOWN';
    const start = process.hrtime.bigint();
    metrics.observeRequestStart(method);
    let recorded = false;
    const record = (): void => {
      if (recorded) {
        return;
      }
      recorded = true;
      const route = metrics.normalizeRoute(req.route && req.route.path ? req.route.path : undefined);
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      metrics.observeRequestEnd(method, route, res.statusCode, durationSeconds);
    };
    res.once('finish', record);
    res.once('close', record);
    next();
  };
}
