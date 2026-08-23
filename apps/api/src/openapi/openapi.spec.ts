import { INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import { JWT_CONFIG } from '../auth/config/jwt.config';
import { CacheService } from '../common/cache/cache.service';
import { DOCUMENTED_CONTROLLER_COUNT, DOCUMENTED_HANDLER_COUNT } from './openapi.contract';
import { OPENAPI_JSON_PATH, setupOpenApi, SWAGGER_UI_PATH } from './openapi';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock-argon2-hash'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);

describe('AUDIT-011 OpenAPI runtime contract', () => {
  let app: INestApplication;
  let document: ReturnType<typeof setupOpenApi>;
  let jwtService: JwtService;
  let authService: AuthService;

  beforeAll(async () => {
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
    jwtService = moduleFixture.get(JwtService);
    authService = moduleFixture.get(AuthService);
    jest.spyOn(authService, 'isTokenBlacklisted').mockResolvedValue(false);
    jest.spyOn(authService, 'getUserRevocationCutoff').mockResolvedValue(0);
    document = setupOpenApi(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const tokenFor = (roles: string[]): string => jwtService.sign(
    { sub: '00000000-0000-4000-8000-000000000001', email: 'docs@example.com', tenantId: null, roles, permissions: [], iat: Math.floor(Date.now() / 1000) },
    { secret: JWT_CONFIG.accessTokenSecret, expiresIn: '15m' },
  );

  const operation = (path: string, method: string): Record<string, unknown> =>
    (document.paths[path] as Record<string, unknown>)[method] as Record<string, unknown>;

  it('generates OpenAPI 3 with every discovered REST controller, handler and live route represented', () => {
    expect(document.openapi).toBe('3.0.0');

    // Discover controllers and HTTP handlers from Nest's runtime container so
    // adding a handler without extending the explicit contract fails this test.
    const controllerTypes = new Set<{ name: string; prototype: Record<string, unknown> }>();
    for (const moduleRef of app.get(ModulesContainer).values()) {
      for (const wrapper of moduleRef.controllers.values()) {
        if (wrapper.metatype) {
          controllerTypes.add(wrapper.metatype);
        }
      }
    }

    const handlerKeys = new Set<string>();
    const expectedRoutes = new Set<string>();
    const controllersWithRoutes = new Set<{ name: string; prototype: Record<string, unknown> }>();
    for (const controller of controllerTypes) {
      const prototype = controller.prototype as Record<string, unknown>;
      const controllerPaths = Reflect.getMetadata(PATH_METADATA, controller) as string | string[] | undefined;
      const prefixes = Array.isArray(controllerPaths) ? controllerPaths : [controllerPaths ?? ''];
      for (const methodName of Object.getOwnPropertyNames(prototype)) {
        const handler = prototype[methodName];
        if (typeof handler !== 'function') {
          continue;
        }
        const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (requestMethod === undefined) {
          continue;
        }
        const verb = RequestMethod[requestMethod].toLowerCase();
        if (!HTTP_METHODS.has(verb)) {
          continue;
        }
        const methodPaths = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
        const suffixes = Array.isArray(methodPaths) ? methodPaths : [methodPaths ?? ''];
        controllersWithRoutes.add(controller);
        handlerKeys.add(`${controller.name}.${methodName}`);
        for (const prefix of prefixes) {
          for (const suffix of suffixes) {
            const route = `/${`${prefix}/${suffix}`.split('/').filter(Boolean).join('/')}`
              .replace(/:([A-Za-z0-9_]+)/g, '{$1}');
            expectedRoutes.add(`${verb} ${route}`);
          }
        }
      }
    }

    expect(DOCUMENTED_CONTROLLER_COUNT).toBe(controllersWithRoutes.size);
    expect(DOCUMENTED_HANDLER_COUNT).toBe(handlerKeys.size);
    expect(DOCUMENTED_CONTROLLER_COUNT).toBe(24);
    expect(DOCUMENTED_HANDLER_COUNT).toBe(108);

    const missingRoutes = [...expectedRoutes].filter((key) => {
      const [verb, path] = key.split(' ');
      return !(document.paths[path] as Record<string, unknown> | undefined)?.[verb];
    });
    expect(missingRoutes).toEqual([]);

    const operations = Object.values(document.paths).flatMap((pathItem) =>
      Object.entries(pathItem ?? {}).filter(([method]) => HTTP_METHODS.has(method)),
    );
    // DesignController deliberately has two live prefixes, so its ten handlers
    // appear twice: 93 handler methods -> 103 concrete OpenAPI operations.
    expect(expectedRoutes.size).toBe(118);
    expect(operations).toHaveLength(expectedRoutes.size);
    expect(operations.every(([, value]) => Boolean((value as { summary?: string }).summary))).toBe(true);
    expect(operations.every(([, value]) => Boolean((value as { responses?: unknown }).responses))).toBe(true);
    expect(operations.every(([, value]) => Boolean((value as { 'x-tenant-scope'?: string })['x-tenant-scope']))).toBe(true);
  });

  it('produces unique operation IDs and resolves every local schema reference', () => {
    const operations = Object.values(document.paths).flatMap((pathItem) =>
      Object.entries(pathItem ?? {})
        .filter(([method]) => HTTP_METHODS.has(method))
        .map(([, value]) => value as { operationId?: string; responses?: Record<string, unknown> }),
    );
    const ids = operations.map((item) => item.operationId);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(operations.every((item) => Object.keys(item.responses ?? {}).some((status) => /^2\d\d$/.test(status)))).toBe(true);

    const serialized = JSON.stringify(document);
    const references = [...serialized.matchAll(/#\/components\/schemas\/([A-Za-z0-9_]+)/g)].map((match) => match[1]);
    for (const name of references) {
      expect(document.components?.schemas).toHaveProperty(name);
    }
  });

  it('documents both the standard and legacy live design routes', () => {
    expect(document.paths['/api/v1/design/tenant/{tenantId}']).toBeDefined();
    expect(document.paths['/design/tenant/{tenantId}']).toBeDefined();
    expect(document.paths['/api/v1/design/platform']).toBeDefined();
    expect(document.paths['/design/platform']).toBeDefined();
  });

  it('declares the real bearer, tenant, CSRF, refresh-cookie and webhook signature schemes', () => {
    expect(document.components?.securitySchemes).toMatchObject({
      bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      tenantContext: { type: 'apiKey', in: 'header', name: 'X-Tenant-ID' },
      csrfToken: { type: 'apiKey', in: 'header', name: 'X-CSRF-Token' },
      refreshCookie: { type: 'apiKey', in: 'cookie', name: '__Host-Refresh-Token' },
      stripeSignature: { type: 'apiKey', in: 'header', name: 'stripe-signature' },
      tapHashstring: { type: 'apiKey', in: 'header', name: 'hashstring' },
    });
  });

  it('distinguishes public, tenant, RBAC and PLATFORM_OWNER operations', () => {
    expect(operation('/api/v1/public/menu', 'get').security).toBeUndefined();
    expect(operation('/api/v1/menu/products', 'get').security).toEqual(expect.arrayContaining([{ bearer: [] }]));
    expect(operation('/api/v1/menu/products', 'get')['x-required-permission']).toBe('read:Product');
    expect(operation('/api/v1/admin/tenants/metrics', 'get')['x-required-permission']).toContain('PLATFORM_OWNER');
    expect(operation('/api/v1/design/tenant/{tenantId}', 'get').description).toContain('JWT tenant is authoritative');
  });

  it('documents CSRF only on authenticated mutating operations', () => {
    const update = operation('/api/v1/menu/products/{id}', 'put');
    expect(update.security).toEqual([{ bearer: [], csrfToken: [] }]);
    expect((update.parameters as Array<{ name: string }>).map((item) => item.name)).toContain('X-CSRF-Token');
    expect(operation('/api/v1/menu/products', 'get').security).not.toEqual(expect.arrayContaining([{ csrfToken: [] }]));
    expect(operation('/api/v1/public/orders/checkout', 'post').security).toBeUndefined();
  });

  it('documents Stripe and Tap signature headers on the actual webhook routes', () => {
    expect(operation('/api/v1/billing/webhooks', 'post').security).toEqual([{ stripeSignature: [] }]);
    expect(operation('/api/v1/payments/webhooks/tap', 'post').security).toEqual([{ tapHashstring: [] }]);
  });

  it('documents Media as a bearer + RBAC surface', () => {
    const media = operation('/api/v1/media', 'get');
    expect(media.security).toEqual(expect.arrayContaining([{ bearer: [] }]));
    expect(media['x-required-permission']).toBe('read:Media');
    expect(operation('/api/v1/assets/presigned-url', 'post')['x-required-permission']).toBe('create:Media');
  });

  it('documents multipart upload and representative request/response schemas', () => {
    const upload = operation('/api/v1/media/upload', 'post');
    expect(upload.requestBody).toMatchObject({ content: { 'multipart/form-data': {} } });
    expect(document.components?.schemas?.UploadMediaRequest).toMatchObject({
      required: expect.arrayContaining(['file', 'entityType', 'entityId', 'mediaType']),
      properties: { file: { type: 'string', format: 'binary', writeOnly: true } },
    });
    expect(document.components?.schemas?.CreateOrderRequest).toBeDefined();
    expect(document.components?.schemas?.Order).toBeDefined();
    expect(document.components?.schemas?.PublicMenu).toBeDefined();
  });

  it('marks every sensitive documented field writeOnly and includes no secret examples', () => {
    const schemas = document.components?.schemas as Record<string, { properties?: Record<string, { writeOnly?: boolean; readOnly?: boolean }> }>;
    const writeOnly = [
      ['LoginRequest', 'password'], ['LoginRequest', 'mfaToken'], ['ResetPasswordRequest', 'token'],
      ['ResetPasswordRequest', 'password'], ['VerifyEmailRequest', 'token'], ['CreateTenantRequest', 'ownerPassword'],
      ['CreateUserRequest', 'password'], ['UpdateUserRequest', 'password'], ['CreateDeviceTokenRequest', 'token'],
      ['CreateWebhookRequest', 'secretKey'],
    ];
    for (const [model, field] of writeOnly) {
      expect(schemas[model].properties?.[field]?.writeOnly).toBe(true);
    }
    const readOnly = [
      ['AuthSession', 'accessToken'], ['AuthSession', 'csrfToken'], ['MfaEnableResponse', 'secret'],
      ['MfaVerifyResponse', 'backupCodes'], ['DeviceToken', 'token'], ['WalletPayment', 'clientSecret'],
    ];
    for (const [model, field] of readOnly) {
      expect(schemas[model].properties?.[field]?.readOnly).toBe(true);
    }
    const wallet = schemas.WalletPayment as unknown as {
      properties: { nextAction: { properties: { stripeSdk: { properties: { clientSecret: { readOnly?: boolean } } } } } };
    };
    expect(wallet.properties.nextAction.properties.stripeSdk.properties.clientSecret.readOnly).toBe(true);
    expect(JSON.stringify(document)).not.toMatch(/mock-secret|test-secret|ghp_|sk_live_|whsec_/i);
  });

  it('reuses a common error schema only for statuses declared by each endpoint', () => {
    expect(document.components?.schemas?.ApiError).toBeDefined();
    const productRestore = operation('/api/v1/menu/products/{id}/restore', 'post');
    expect(productRestore.responses).toHaveProperty('409');
    expect(productRestore.responses).not.toHaveProperty('503');
    expect(operation('/api/v1/payments/wallet', 'post').responses).toHaveProperty('503');
  });

  it('documents the AUDIT-023 infrastructure endpoints (/live, /ready, /metrics)', () => {
    const live = operation('/live', 'get');
    expect(live.security).toBeUndefined();
    expect(live['x-tenant-scope']).toBe('tenant-free');

    const ready = operation('/ready', 'get');
    expect(ready.security).toBeUndefined();
    expect(ready['x-tenant-scope']).toBe('tenant-free');
    expect(ready.responses).toHaveProperty('503');

    const metrics = operation('/metrics', 'get');
    expect(metrics.security).toEqual([{ metricsToken: [] }]);
    expect(metrics['x-tenant-scope']).toBe('tenant-free');
    expect(metrics.responses).toHaveProperty('401');
    expect(metrics.responses).toHaveProperty('503');
  });

  it('rejects anonymous and non-platform access to both documentation routes', async () => {
    await request(app.getHttpServer()).get(SWAGGER_UI_PATH).expect(401);
    await request(app.getHttpServer()).get(OPENAPI_JSON_PATH).expect(401);

    const tenantToken = tokenFor(['RESTAURANT_OWNER']);
    await request(app.getHttpServer()).get(SWAGGER_UI_PATH).set('Authorization', `Bearer ${tenantToken}`).expect(403);
    await request(app.getHttpServer()).get(OPENAPI_JSON_PATH).set('Authorization', `Bearer ${tenantToken}`).expect(403);
  });

  it('rejects invalid and revoked PLATFORM_OWNER tokens', async () => {
    await request(app.getHttpServer())
      .get(OPENAPI_JSON_PATH)
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
    (authService.isTokenBlacklisted as jest.Mock).mockResolvedValueOnce(true);
    await request(app.getHttpServer())
      .get(OPENAPI_JSON_PATH)
      .set('Authorization', `Bearer ${tokenFor(['PLATFORM_OWNER'])}`)
      .expect(401);
  });

  it('serves Swagger UI and JSON only to an authenticated PLATFORM_OWNER without tenant context', async () => {
    const token = tokenFor(['PLATFORM_OWNER']);
    await request(app.getHttpServer())
      .get(SWAGGER_UI_PATH)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect('Content-Type', /html/);
    const response = await request(app.getHttpServer())
      .get(OPENAPI_JSON_PATH)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect('Content-Type', /json/);
    expect(response.body.openapi).toBe('3.0.0');
    await request(app.getHttpServer())
      .get(`${SWAGGER_UI_PATH}/swagger-ui.css`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect('Content-Type', /css/);

    // A browser's Basic-auth credential cache propagates the JWT password to
    // UI assets and the JSON subrequest, making the protected UI usable without
    // weakening the PLATFORM_OWNER JWT/revocation policy.
    await request(app.getHttpServer())
      .get(SWAGGER_UI_PATH)
      .auth('platform-owner', token)
      .expect(200)
      .expect('Content-Type', /html/);
    await request(app.getHttpServer())
      .get(`${SWAGGER_UI_PATH}/swagger-ui-bundle.js`)
      .auth('platform-owner', token)
      .expect(200)
      .expect('Content-Type', /javascript/);
    await request(app.getHttpServer())
      .get(OPENAPI_JSON_PATH)
      .auth('platform-owner', token)
      .expect(200)
      .expect('Content-Type', /json/);
  });

  it('keeps the PLATFORM_OWNER policy in production mode', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await request(app.getHttpServer()).get(OPENAPI_JSON_PATH).expect(401);
      await request(app.getHttpServer())
        .get(OPENAPI_JSON_PATH)
        .set('Authorization', `Bearer ${tokenFor(['PLATFORM_OWNER'])}`)
        .expect(200);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('fails closed when documentation token revocation lookup is unavailable', async () => {
    (authService.isTokenBlacklisted as jest.Mock).mockRejectedValueOnce(new Error('cache unavailable'));
    await request(app.getHttpServer())
      .get(OPENAPI_JSON_PATH)
      .set('Authorization', `Bearer ${tokenFor(['PLATFORM_OWNER'])}`)
      .expect(503);
  });
});
