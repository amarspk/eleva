import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../app.module';
import { setupOpenApi } from '../../openapi/openapi';
import { CacheService } from '../cache/cache.service';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock-argon2-hash'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

const METRICS_TOKEN = 'audit023-integration-token';
const SENSITIVE_UUID = 'a3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

describe('AUDIT-023 observability endpoints (integration)', () => {
  let app: INestApplication;
  let previousMetricsToken: string | undefined;

  const authenticatedMetrics = (): request.Test =>
    request(app.getHttpServer()).get('/metrics').set('Authorization', `Bearer ${METRICS_TOKEN}`);

  beforeAll(async () => {
    previousMetricsToken = process.env.METRICS_TOKEN;
    process.env.METRICS_TOKEN = METRICS_TOKEN;

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CacheService)
      .useValue({
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        isCacheActive: () => false,
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (previousMetricsToken === undefined) {
      delete process.env.METRICS_TOKEN;
    } else {
      process.env.METRICS_TOKEN = previousMetricsToken;
    }
    await app.close();
  });

  describe('liveness /live', () => {
    it('succeeds without tenant context and without any dependency', async () => {
      const response = await request(app.getHttpServer()).get('/live').expect(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('readiness /ready', () => {
    it('fails with 503 when the database is unavailable (no DATABASE_URL in this environment)', async () => {
      const response = await request(app.getHttpServer()).get('/ready').expect(503);
      expect(response.body).toMatchObject({
        status: 'unavailable',
        checks: { database: 'down' },
      });
      expect(Object.keys(response.body.checks)).toEqual(['database']);
    });
  });

  describe('legacy /health compatibility', () => {
    it('preserves the existing contract', async () => {
      const response = await request(app.getHttpServer()).get('/health').expect(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('metrics access control', () => {
    it('fails closed with 503 when METRICS_TOKEN is not configured', async () => {
      delete process.env.METRICS_TOKEN;
      try {
        const response = await request(app.getHttpServer()).get('/metrics').expect(503);
        expect(response.body.message).toContain('METRICS_TOKEN');
      } finally {
        process.env.METRICS_TOKEN = METRICS_TOKEN;
      }
    });

    it('rejects requests without a token with 401', async () => {
      await request(app.getHttpServer()).get('/metrics').expect(401);
    });

    it('rejects an invalid token with 401', async () => {
      await request(app.getHttpServer())
        .get('/metrics')
        .set('Authorization', 'Bearer wrong-token-value')
        .expect(401);
    });
  });

  describe('metrics exposition', () => {
    it('serves Prometheus output with the correct content type and no-store', async () => {
      const response = await authenticatedMetrics().expect(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.text).toContain('# HELP http_requests_total');
      expect(response.text).toContain('# TYPE http_requests_total counter');
    });

    it('never instruments itself: no /metrics label appears in the exposition', async () => {
      const response = await authenticatedMetrics().expect(200);
      expect(response.text).not.toContain('route="/metrics"');
    });

    it('labels requests with the matched route template and never leaks raw ids or query data', async () => {
      // A request that reaches the route layer: JwtAuthGuard rejects it 401,
      // but the Express route has matched, so the template label is
      // '/api/v1/auth/me' — never the tenant id from the X-Tenant-ID header.
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('X-Tenant-ID', SENSITIVE_UUID)
        .expect(401);
      const response = await authenticatedMetrics().expect(200);
      expect(response.text).toContain('route="/api/v1/auth/me"');
      expect(response.text).not.toContain(SENSITIVE_UUID);
    });

    it('labels middleware-rejected requests as unmatched without leaking the raw path', async () => {
      // The tenant fail-safe rejects before any Express route matches, so the
      // honest bounded label is 'unmatched' — and the raw uuid never appears.
      await request(app.getHttpServer()).get(`/api/v1/public/table/${SENSITIVE_UUID}`).expect(403);
      const response = await authenticatedMetrics().expect(200);
      expect(response.text).toContain('route="unmatched"');
      expect(response.text).not.toContain(SENSITIVE_UUID);
    });
  });

  describe('middleware boundaries', () => {
    it('keeps every infrastructure endpoint tenant-free', async () => {
      await request(app.getHttpServer()).get('/live').expect(200);
      await request(app.getHttpServer()).get('/health').expect(200);
      await authenticatedMetrics().expect(200);
    });

    it('keeps protected application routes protected (tenant fail-safe, then JwtAuthGuard)', async () => {
      // Without tenant context: the tenant fail-safe rejects with 403 before
      // routing. With tenant context but no JWT: JwtAuthGuard rejects 401.
      await request(app.getHttpServer()).get('/api/v1/auth/me').expect(403);
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('X-Tenant-ID', SENSITIVE_UUID)
        .expect(401);
    });
  });

  describe('OpenAPI representation', () => {
    it('documents /live, /ready and /metrics in the existing contract', () => {
      const document = setupOpenApi(app);
      expect(document.paths['/live']?.get).toBeDefined();
      expect(document.paths['/ready']?.get).toBeDefined();
      expect(document.paths['/metrics']?.get).toBeDefined();
      const metricsOperation = document.paths['/metrics']?.get as { security?: unknown; responses?: unknown };
      expect(metricsOperation.security).toEqual([{ metricsToken: [] }]);
      expect(metricsOperation.responses).toBeDefined();
    });
  });
});
