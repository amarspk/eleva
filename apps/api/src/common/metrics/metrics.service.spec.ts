import {
  MAX_TRACKED_ROUTES,
  METHOD_OTHER,
  MetricsService,
  normalizeHttpMethod,
  ROUTE_OVERFLOW,
  UNMATCHED_ROUTE,
} from './metrics.service';

describe('AUDIT-023 MetricsService', () => {
  it('gives every instance an isolated registry so tests cannot contaminate each other', async () => {
    const first = new MetricsService();
    const second = new MetricsService();
    first.observeRequestStart('GET');
    first.observeRequestEnd('GET', '/only-first', 200, 0.01);

    const secondOutput = await second.render();
    expect(secondOutput).not.toContain('/only-first');

    const firstOutput = await first.render();
    expect(firstOutput).toContain('route="/only-first"');
  });

  it('exposes only the three approved metric families with no process/default metrics', async () => {
    const service = new MetricsService();
    const output = await service.render();
    expect(output).toContain('# HELP http_requests_total');
    expect(output).toContain('# HELP http_request_duration_seconds');
    expect(output).toContain('# HELP http_requests_in_flight');
    expect(output).not.toContain('process_');
    expect(output).not.toContain('nodejs_');
  });

  it('normalizes missing route information to the bounded unmatched label', () => {
    const service = new MetricsService();
    expect(service.normalizeRoute(undefined)).toBe(UNMATCHED_ROUTE);
    expect(service.normalizeRoute('')).toBe(UNMATCHED_ROUTE);
  });

  it('caps route-label cardinality at the configured bound', () => {
    const service = new MetricsService();
    for (let i = 0; i < MAX_TRACKED_ROUTES; i += 1) {
      expect(service.normalizeRoute(`/route/${i}`)).toBe(`/route/${i}`);
    }
    expect(service.normalizeRoute('/route/overflow')).toBe(ROUTE_OVERFLOW);
    expect(service.normalizeRoute('/route/overflow')).toBe(ROUTE_OVERFLOW);
  });

  it('tracks requests, durations and in-flight counts deterministically', async () => {
    const service = new MetricsService();
    service.observeRequestStart('GET');
    service.observeRequestStart('GET');
    service.observeRequestEnd('GET', '/api/v1/public/table/:token', 200, 0.05);
    service.observeRequestEnd('GET', '/api/v1/public/table/:token', 404, 0.2);

    const output = await service.render();
    expect(output).toContain('http_requests_in_flight{method="GET"} 0');
    expect(output).toContain('http_requests_total{method="GET",route="/api/v1/public/table/:token",status="200"} 1');
    expect(output).toContain('http_requests_total{method="GET",route="/api/v1/public/table/:token",status="404"} 1');
    expect(output).toContain('http_request_duration_seconds_count{method="GET",route="/api/v1/public/table/:token",status="200"} 1');
  });
});

describe('AUDIT-023 HTTP method label normalization', () => {
  it('keeps every standard verb unchanged', () => {
    for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      expect(normalizeHttpMethod(method)).toBe(method);
    }
  });

  it('normalizes unexpected/custom methods to OTHER', () => {
    expect(normalizeHttpMethod('TRACE')).toBe(METHOD_OTHER);
    expect(normalizeHttpMethod('BREW')).toBe(METHOD_OTHER);
    expect(normalizeHttpMethod('PURGE')).toBe(METHOD_OTHER);
    expect(normalizeHttpMethod('')).toBe(METHOD_OTHER);
    expect(normalizeHttpMethod(undefined)).toBe(METHOD_OTHER);
  });

  it('records GET and POST as themselves in the exposition', async () => {
    const service = new MetricsService();
    service.observeRequestStart('GET');
    service.observeRequestEnd('GET', '/get-route', 200, 0.01);
    service.observeRequestStart('POST');
    service.observeRequestEnd('POST', '/post-route', 201, 0.02);

    const output = await service.render();
    expect(output).toContain('http_requests_total{method="GET",route="/get-route",status="200"} 1');
    expect(output).toContain('http_requests_total{method="POST",route="/post-route",status="201"} 1');
  });

  it('never exposes a raw unexpected method in the exposition', async () => {
    const service = new MetricsService();
    service.observeRequestStart('BREW');
    service.observeRequestEnd('BREW', '/custom', 200, 0.01);

    const output = await service.render();
    expect(output).toContain('http_requests_total{method="OTHER",route="/custom",status="200"} 1');
    expect(output).not.toContain('BREW');
    expect(output).not.toContain('method="BREW"');
  });
});
