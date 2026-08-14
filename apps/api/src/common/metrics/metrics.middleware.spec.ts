import { EventEmitter } from 'events';
import { createHttpMetricsMiddleware } from './metrics.middleware';
import { MetricsService } from './metrics.service';

interface MockResponse extends EventEmitter {
  statusCode: number;
}

interface MockRequest {
  path: string;
  method: string;
  route?: { path: string };
}

const makeRes = (): MockResponse => {
  const res = new EventEmitter() as MockResponse;
  res.statusCode = 200;
  return res;
};

const runRequest = async (
  middleware: ReturnType<typeof createHttpMetricsMiddleware>,
  req: MockRequest,
  res: MockResponse,
): Promise<boolean> => {
  let nextCalled = false;
  middleware(req as never, res as never, () => {
    nextCalled = true;
  });
  res.emit('finish');
  return nextCalled;
};

describe('AUDIT-023 HTTP metrics middleware', () => {
  it('records counter, histogram and returns the in-flight gauge to zero on finish', async () => {
    const metrics = new MetricsService();
    const middleware = createHttpMetricsMiddleware(metrics);
    const req: MockRequest = { path: '/api/v1/public/table/:token', method: 'GET', route: { path: '/api/v1/public/table/:token' } };
    const nextCalled = await runRequest(middleware, req, makeRes());

    const output = await metrics.render();
    expect(nextCalled).toBe(true);
    expect(output).toContain('http_requests_total{method="GET",route="/api/v1/public/table/:token",status="200"} 1');
    expect(output).toContain('http_requests_in_flight{method="GET"} 0');
  });

  it('labels with the matched route TEMPLATE and never with the raw URL or ids', async () => {
    const metrics = new MetricsService();
    const middleware = createHttpMetricsMiddleware(metrics);
    const sensitiveId = 'a3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
    const req: MockRequest = {
      path: `/api/v1/orders/${sensitiveId}?secret=1`,
      method: 'GET',
      route: { path: '/api/v1/orders/:id' },
    };
    await runRequest(middleware, req, makeRes());

    const output = await metrics.render();
    expect(output).toContain('route="/api/v1/orders/:id"');
    expect(output).not.toContain(sensitiveId);
    expect(output).not.toContain('secret=1');
  });

  it('skips infrastructure probe paths so /metrics can never instrument itself', async () => {
    for (const path of ['/metrics', '/health', '/live', '/ready']) {
      const metrics = new MetricsService();
      const middleware = createHttpMetricsMiddleware(metrics);
      const req: MockRequest = { path, method: 'GET' };
      await runRequest(middleware, req, makeRes());

      const output = await metrics.render();
      expect(output).not.toContain(`route="${path}"`);
      expect(output).toContain('# HELP http_requests_total');
    }
  });

  it('records exactly once when both finish and close fire', async () => {
    const metrics = new MetricsService();
    const middleware = createHttpMetricsMiddleware(metrics);
    const req: MockRequest = { path: '/exactly-once', method: 'GET', route: { path: '/exactly-once' } };
    const res = makeRes();
    middleware(req as never, res as never, () => undefined);
    res.emit('finish');
    res.emit('close');

    const output = await metrics.render();
    expect(output).toContain('http_requests_total{method="GET",route="/exactly-once",status="200"} 1');
  });

  it('uses the unmatched label when no route template is available', async () => {
    const metrics = new MetricsService();
    const middleware = createHttpMetricsMiddleware(metrics);
    const req: MockRequest = { path: '/not-a-real-route', method: 'GET' };
    await runRequest(middleware, req, makeRes());

    const output = await metrics.render();
    expect(output).toContain('http_requests_total{method="GET",route="unmatched",status="200"} 1');
    expect(output).not.toContain('/not-a-real-route');
  });

  it('normalizes a custom method to OTHER and never leaks the raw method', async () => {
    const metrics = new MetricsService();
    const middleware = createHttpMetricsMiddleware(metrics);
    const req: MockRequest = { path: '/custom-method', method: 'BREW', route: { path: '/custom-method' } };
    await runRequest(middleware, req, makeRes());

    const output = await metrics.render();
    expect(output).toContain('http_requests_total{method="OTHER",route="/custom-method",status="200"} 1');
    expect(output).not.toContain('BREW');
  });
});
