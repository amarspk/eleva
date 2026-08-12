import express from 'express';
import request from 'supertest';
import { API_SECURITY_HEADERS, createApiSecurityHeadersMiddleware } from './security-headers.middleware';

describe('AUDIT-020 API security headers', () => {
  function buildApp(isProduction: boolean): express.Express {
    const app = express();
    app.disable('x-powered-by');
    app.use(createApiSecurityHeadersMiddleware({ isProduction }));
    app.get('/health', (_req, res) => res.json({ status: 'ok' }));
    // Exercise the exact public URL shape used by LocalStorageProvider without
    // requiring a filesystem fixture.
    app.get('/uploads/tenant/product.webp', (_req, res) => {
      res.type('image/webp').send(Buffer.from('test-image'));
    });
    return app;
  }

  it('adds the reviewed baseline to ordinary API responses without CSP/COEP/CORP', async () => {
    const response = await request(buildApp(false)).get('/health').expect(200);

    expect(response.headers['x-content-type-options']).toBe(API_SECURITY_HEADERS.contentTypeOptions);
    expect(response.headers['x-frame-options']).toBe(API_SECURITY_HEADERS.frameOptions);
    expect(response.headers['referrer-policy']).toBe(API_SECURITY_HEADERS.referrerPolicy);
    expect(response.headers['permissions-policy']).toBe(API_SECURITY_HEADERS.permissionsPolicy);
    expect(response.headers['x-xss-protection']).toBe('0');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['strict-transport-security']).toBeUndefined();
    expect(response.headers['content-security-policy']).toBeUndefined();
    expect(response.headers['content-security-policy-report-only']).toBeUndefined();
    expect(response.headers['cross-origin-embedder-policy']).toBeUndefined();
    expect(response.headers['cross-origin-resource-policy']).toBeUndefined();
  });

  it('adds production HSTS without includeSubDomains or preload', async () => {
    const response = await request(buildApp(true)).get('/health').expect(200);

    expect(response.headers['strict-transport-security']).toBe('max-age=31536000');
    expect(response.headers['strict-transport-security']).not.toContain('includeSubDomains');
    expect(response.headers['strict-transport-security']).not.toContain('preload');
  });

  it('keeps public /uploads/ consumable across the API/frontend origin boundary', async () => {
    const response = await request(buildApp(true))
      .get('/uploads/tenant/product.webp')
      .expect(200)
      .expect('Content-Type', /image\/webp/);

    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(response.headers['cross-origin-embedder-policy']).toBeUndefined();
    expect(response.body).toBeDefined();
  });
});
