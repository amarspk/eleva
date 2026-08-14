import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry } from 'prom-client';

export const HTTP_REQUESTS_TOTAL = 'http_requests_total';
export const HTTP_REQUEST_DURATION_SECONDS = 'http_request_duration_seconds';
export const HTTP_REQUESTS_IN_FLIGHT = 'http_requests_in_flight';
export const UNMATCHED_ROUTE = 'unmatched';
export const ROUTE_OVERFLOW = 'other';
export const MAX_TRACKED_ROUTES = 100;

/**
 * AUDIT-023 — process-isolated Prometheus metrics registry.
 *
 * Every MetricsService owns a fresh prom-client Registry (never the library's
 * global default), so every Nest module instance and every test gets a
 * deterministic, uncontaminated registry. Labels are strictly bounded:
 *
 * - `method`: the HTTP verb (a fixed, finite runtime enum).
 * - `route`: the matched Express route TEMPLATE (e.g. '/api/v1/orders/:id'),
 *   resolved when the response finishes — after the Express route layer has
 *   matched. Raw URLs, query strings, tenant/user/order ids and uuids are
 *   never read for labeling. Requests rejected by middleware before any
 *   route matches are labeled 'unmatched'.
 * - `status`: the numeric HTTP status code.
 *
 * A hard cap on distinct route templates (MAX_TRACKED_ROUTES) prevents
 * unbounded cardinality even if the route table were to grow dynamically.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  private readonly httpRequestsTotal: Counter<'method' | 'route' | 'status'>;
  private readonly httpRequestDurationSeconds: Histogram<'method' | 'route' | 'status'>;
  private readonly httpRequestsInFlight: Gauge<'method'>;
  private readonly knownRoutes = new Set<string>();

  constructor() {
    this.httpRequestsTotal = new Counter<'method' | 'route' | 'status'>({
      name: HTTP_REQUESTS_TOTAL,
      help: 'Total HTTP requests handled by the API.',
      labelNames: ['method', 'route', 'status'] as const,
      registers: [this.registry],
    });
    this.httpRequestDurationSeconds = new Histogram<'method' | 'route' | 'status'>({
      name: HTTP_REQUEST_DURATION_SECONDS,
      help: 'HTTP request duration in seconds.',
      labelNames: ['method', 'route', 'status'] as const,
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });
    this.httpRequestsInFlight = new Gauge<'method'>({
      name: HTTP_REQUESTS_IN_FLIGHT,
      help: 'Current number of in-flight HTTP requests.',
      labelNames: ['method'] as const,
      registers: [this.registry],
    });
  }

  /** Bounds route-label cardinality to the application's own route templates. */
  normalizeRoute(rawRoute: string | undefined): string {
    const route = rawRoute && rawRoute.length > 0 ? rawRoute : UNMATCHED_ROUTE;
    if (route === UNMATCHED_ROUTE || this.knownRoutes.has(route)) {
      return route;
    }
    if (this.knownRoutes.size >= MAX_TRACKED_ROUTES) {
      return ROUTE_OVERFLOW;
    }
    this.knownRoutes.add(route);
    return route;
  }

  /**
   * In-flight tracking starts at request entry. The route template is not
   * yet available at entry (Nest middleware runs before the Express route
   * layer dispatches), so the gauge is labeled by method only — bounded and
   * honest.
   */
  observeRequestStart(method: string): void {
    this.httpRequestsInFlight.inc({ method });
  }

  /**
   * Final observation at response finish/close: the matched route template
   * is resolved here (or 'unmatched' when no route ever matched) and the
   * in-flight gauge is decremented exactly once.
   */
  observeRequestEnd(method: string, route: string, statusCode: number, durationSeconds: number): void {
    this.httpRequestsInFlight.dec({ method });
    const status = String(statusCode);
    this.httpRequestsTotal.inc({ method, route, status });
    this.httpRequestDurationSeconds.observe({ method, route, status }, durationSeconds);
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }
}
