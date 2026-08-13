import { ExecutionContext, ForbiddenException, INestApplication, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { CaslAbilityFactory } from '../auth/casl-ability.factory';
import { REQUIRE_PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { AuthenticatedRequest, AuthenticatedUser } from '../common/types/request.types';
import { DesignController } from './design.controller';
import { DesignData, DesignService } from './design.service';

const TENANT_A = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb';
const DRAFT: DesignData = { colors: { primary: '#123456' }, sections: [] };

describe('DesignController A1 — tenant isolation and authorization', () => {
  let controller: DesignController;
  let guard: RbacPermissionGuard;
  let reflector: Reflector;
  let service: {
    getDesign: jest.Mock;
    getPublishedDesign: jest.Mock;
    saveDraft: jest.Mock;
    publish: jest.Mock;
    getVersions: jest.Mock;
    restore: jest.Mock;
    getPublishedPlatformDesign: jest.Mock;
    getPlatformPreview: jest.Mock;
    savePlatformDraft: jest.Mock;
    publishPlatform: jest.Mock;
  };

  const ownerA: AuthenticatedUser = {
    id: 'owner-a',
    email: 'owner-a@example.com',
    tenantId: TENANT_A,
    roles: ['RESTAURANT_OWNER'],
    permissions: ['tenant:read', 'tenant:update'],
  };
  const ownerB: AuthenticatedUser = {
    id: 'owner-b',
    email: 'owner-b@example.com',
    tenantId: TENANT_B,
    roles: ['RESTAURANT_OWNER'],
    permissions: ['tenant:read', 'tenant:update'],
  };
  const kitchenA: AuthenticatedUser = {
    id: 'kitchen-a',
    email: 'kitchen-a@example.com',
    tenantId: TENANT_A,
    roles: ['KITCHEN_STAFF'],
    permissions: ['order:read', 'kds:read'],
  };
  const platformOwner: AuthenticatedUser = {
    id: 'platform-owner',
    email: 'platform@example.com',
    tenantId: null,
    roles: ['PLATFORM_OWNER'],
    permissions: [],
  };

  const requestFor = (user: AuthenticatedUser, params: Record<string, string> = {}): AuthenticatedRequest =>
    ({ user, params, headers: {} }) as unknown as AuthenticatedRequest;

  const contextFor = (
    handler: (...args: never[]) => unknown,
    user: AuthenticatedUser,
    params: Record<string, string> = {},
  ): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => DesignController,
      switchToHttp: () => ({ getRequest: () => requestFor(user, params) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    service = {
      getDesign: jest.fn().mockResolvedValue({ draft: DRAFT, published: {}, version: 1, publishedAt: null }),
      getPublishedDesign: jest.fn().mockResolvedValue({ marker: 'tenant-published' }),
      saveDraft: jest.fn().mockResolvedValue({ draft: DRAFT }),
      publish: jest.fn().mockResolvedValue({ published: DRAFT }),
      getVersions: jest.fn().mockResolvedValue([]),
      restore: jest.fn().mockResolvedValue({ draft: DRAFT }),
      getPublishedPlatformDesign: jest.fn().mockResolvedValue({ marker: 'platform-published' }),
      getPlatformPreview: jest.fn().mockResolvedValue({ marker: 'platform-private-draft' }),
      savePlatformDraft: jest.fn().mockResolvedValue({ draft: DRAFT }),
      publishPlatform: jest.fn().mockResolvedValue({ published: DRAFT }),
    };
    controller = new DesignController(service as unknown as DesignService);
    reflector = new Reflector();
    guard = new RbacPermissionGuard(reflector, new CaslAbilityFactory());
  });

  it('allows Tenant A to read and save its own design using JWT tenant identity', async () => {
    await expect(
      guard.canActivate(
        contextFor(DesignController.prototype.getForTenant as never, ownerA, { tenantId: TENANT_A }),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        contextFor(DesignController.prototype.saveDraft as never, ownerA, { tenantId: TENANT_A }),
      ),
    ).resolves.toBe(true);

    await controller.getForTenant(TENANT_A, requestFor(ownerA), 'true');
    await controller.saveDraft(TENANT_A, DRAFT, requestFor(ownerA));

    expect(service.getDesign).toHaveBeenCalledWith(TENANT_A, true);
    expect(service.saveDraft).toHaveBeenCalledWith(TENANT_A, DRAFT);
  });

  it('denies every Tenant A attempt to read, save, publish, list or restore Tenant B design', async () => {
    const req = requestFor(ownerA);
    const attempts = [
      () => controller.getForTenant(TENANT_B, req, 'true'),
      () => controller.saveDraft(TENANT_B, DRAFT, req),
      () => controller.publish(TENANT_B, req),
      () => controller.versions(TENANT_B, req),
      () => controller.restore(TENANT_B, 2, req),
    ];

    for (const attempt of attempts) {
      await expect(Promise.resolve().then(attempt)).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(service.getDesign).not.toHaveBeenCalled();
    expect(service.saveDraft).not.toHaveBeenCalled();
    expect(service.publish).not.toHaveBeenCalled();
    expect(service.getVersions).not.toHaveBeenCalled();
    expect(service.restore).not.toHaveBeenCalled();
  });

  it('denies every Tenant B attempt to read, save, publish or restore Tenant A design', async () => {
    const req = requestFor(ownerB);
    const attempts = [
      () => controller.getForTenant(TENANT_A, req),
      () => controller.saveDraft(TENANT_A, DRAFT, req),
      () => controller.publish(TENANT_A, req),
      () => controller.restore(TENANT_A, 2, req),
    ];

    for (const attempt of attempts) {
      await expect(Promise.resolve().then(attempt)).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(service.getDesign).not.toHaveBeenCalled();
    expect(service.saveDraft).not.toHaveBeenCalled();
    expect(service.publish).not.toHaveBeenCalled();
    expect(service.restore).not.toHaveBeenCalled();
  });

  it('denies a non-owner without tenant:update from protected design mutation', async () => {
    await expect(
      guard.canActivate(
        contextFor(DesignController.prototype.saveDraft as never, kitchenA, { tenantId: TENANT_A }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.saveDraft).not.toHaveBeenCalled();
  });

  it('allows PLATFORM_OWNER to administer a tenant design and perform platform operations', async () => {
    await expect(
      guard.canActivate(
        contextFor(DesignController.prototype.saveDraft as never, platformOwner, { tenantId: TENANT_B }),
      ),
    ).resolves.toBe(true);

    await controller.saveDraft(TENANT_B, DRAFT, requestFor(platformOwner));
    await controller.getPlatformPreview(requestFor(platformOwner));
    await controller.savePlatform(DRAFT, requestFor(platformOwner));
    await controller.publishPlatform(requestFor(platformOwner));

    expect(service.saveDraft).toHaveBeenCalledWith(TENANT_B, DRAFT);
    expect(service.getPlatformPreview).toHaveBeenCalledTimes(1);
    expect(service.savePlatformDraft).toHaveBeenCalledWith(DRAFT);
    expect(service.publishPlatform).toHaveBeenCalledTimes(1);
  });

  it('denies tenant users access to private platform preview and mutations', async () => {
    await expect(
      Promise.resolve().then(() => controller.getPlatformPreview(requestFor(ownerA))),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      Promise.resolve().then(() => controller.savePlatform(DRAFT, requestFor(ownerA))),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      Promise.resolve().then(() => controller.publishPlatform(requestFor(ownerA))),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(service.getPlatformPreview).not.toHaveBeenCalled();
    expect(service.savePlatformDraft).not.toHaveBeenCalled();
    expect(service.publishPlatform).not.toHaveBeenCalled();
  });

  it('keeps public tenant and platform access published-only', async () => {
    await expect(controller.getPublic(TENANT_A)).resolves.toEqual({ marker: 'tenant-published' });
    await expect(controller.getPlatform()).resolves.toEqual({ marker: 'platform-published' });

    expect(service.getPublishedDesign).toHaveBeenCalledWith(TENANT_A);
    expect(service.getPublishedPlatformDesign).toHaveBeenCalledTimes(1);
    expect(service.getDesign).not.toHaveBeenCalled();
    expect(service.getPlatformPreview).not.toHaveBeenCalled();
  });

  it('pins public and RBAC metadata to the intended methods', () => {
    expect(reflector.get(IS_PUBLIC_KEY, DesignController.prototype.getPublic)).toBe(true);
    expect(reflector.get(IS_PUBLIC_KEY, DesignController.prototype.getPlatform)).toBe(true);
    expect(reflector.get(IS_PUBLIC_KEY, DesignController.prototype.getPlatformPreview)).not.toBe(true);
    expect(reflector.get(IS_PUBLIC_KEY, DesignController.prototype.savePlatform)).not.toBe(true);

    expect(reflector.get(REQUIRE_PERMISSION_KEY, DesignController.prototype.getForTenant)).toEqual({
      action: 'read',
      resource: 'Tenant',
    });
    for (const method of ['saveDraft', 'publish', 'restore'] as const) {
      expect(reflector.get(REQUIRE_PERMISSION_KEY, DesignController.prototype[method])).toEqual({
        action: 'update',
        resource: 'Tenant',
      });
    }
  });
});

describe('DesignController A1 — HTTP authorization boundary', () => {
  let app: INestApplication;
  let currentUser: AuthenticatedUser | undefined;
  const service = {
    getDesign: jest.fn().mockResolvedValue({ draft: DRAFT, published: {}, version: 1, publishedAt: null }),
    getPublishedDesign: jest.fn().mockResolvedValue({ marker: 'tenant-published' }),
    saveDraft: jest.fn().mockResolvedValue({ draft: DRAFT }),
    publish: jest.fn().mockResolvedValue({ published: DRAFT }),
    getVersions: jest.fn().mockResolvedValue([]),
    restore: jest.fn().mockResolvedValue({ draft: DRAFT }),
    getPublishedPlatformDesign: jest.fn().mockResolvedValue({ marker: 'platform-published' }),
    getPlatformPreview: jest.fn().mockResolvedValue({ marker: 'platform-private-draft' }),
    savePlatformDraft: jest.fn().mockResolvedValue({ draft: DRAFT }),
    publishPlatform: jest.fn().mockResolvedValue({ published: DRAFT }),
  };

  const ownerA: AuthenticatedUser = {
    id: 'owner-a',
    email: 'owner-a@example.com',
    tenantId: TENANT_A,
    roles: ['RESTAURANT_OWNER'],
    permissions: ['tenant:read', 'tenant:update'],
  };
  const ownerB: AuthenticatedUser = {
    id: 'owner-b',
    email: 'owner-b@example.com',
    tenantId: TENANT_B,
    roles: ['RESTAURANT_OWNER'],
    permissions: ['tenant:read', 'tenant:update'],
  };
  const kitchenA: AuthenticatedUser = {
    id: 'kitchen-a',
    email: 'kitchen-a@example.com',
    tenantId: TENANT_A,
    roles: ['KITCHEN_STAFF'],
    permissions: ['order:read', 'kds:read'],
  };
  const platformOwner: AuthenticatedUser = {
    id: 'platform-owner',
    email: 'platform@example.com',
    tenantId: null,
    roles: ['PLATFORM_OWNER'],
    permissions: [],
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DesignController],
      providers: [
        { provide: DesignService, useValue: service },
        RbacPermissionGuard,
        CaslAbilityFactory,
        Reflector,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext): boolean => {
          const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
          if (currentUser) {
            req.user = currentUser;
          }
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(() => {
    currentUser = undefined;
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves an authenticated tenant its own design', async () => {
    currentUser = ownerA;
    await request(app.getHttpServer())
      .get(`/design/tenant/${TENANT_A}?preview=true`)
      .expect(200);
    expect(service.getDesign).toHaveBeenCalledWith(TENANT_A, true);
  });

  it('returns 404 for Tenant A targeting Tenant B and vice versa', async () => {
    currentUser = ownerA;
    await request(app.getHttpServer()).get(`/design/tenant/${TENANT_B}`).expect(404);

    currentUser = ownerB;
    await request(app.getHttpServer()).put(`/design/tenant/${TENANT_A}/draft`).send(DRAFT).expect(404);

    expect(service.getDesign).not.toHaveBeenCalled();
    expect(service.saveDraft).not.toHaveBeenCalled();
  });

  it('returns 403 when a role without tenant:update attempts a design mutation', async () => {
    currentUser = kitchenA;
    await request(app.getHttpServer()).put(`/design/tenant/${TENANT_A}/draft`).send(DRAFT).expect(403);
    expect(service.saveDraft).not.toHaveBeenCalled();
  });

  it('allows PLATFORM_OWNER to preview and mutate platform design', async () => {
    currentUser = platformOwner;
    await request(app.getHttpServer()).get('/design/platform/preview').expect(200);
    await request(app.getHttpServer()).put('/design/platform/draft').send(DRAFT).expect(200);
    await request(app.getHttpServer()).post('/design/platform/publish').expect(201);

    expect(service.getPlatformPreview).toHaveBeenCalledTimes(1);
    expect(service.savePlatformDraft).toHaveBeenCalledWith(DRAFT);
    expect(service.publishPlatform).toHaveBeenCalledTimes(1);
  });

  it('denies tenant users private platform preview and mutations', async () => {
    currentUser = ownerA;
    await request(app.getHttpServer()).get('/design/platform/preview').expect(403);
    await request(app.getHttpServer()).put('/design/platform/draft').send(DRAFT).expect(403);
    await request(app.getHttpServer()).post('/design/platform/publish').expect(403);
  });

  it('keeps public platform access published-only even with preview=true', async () => {
    currentUser = undefined;
    await request(app.getHttpServer())
      .get('/design/platform?preview=true')
      .expect(200)
      .expect({ marker: 'platform-published' });

    expect(service.getPublishedPlatformDesign).toHaveBeenCalledTimes(1);
    expect(service.getPlatformPreview).not.toHaveBeenCalled();
  });

  it('keeps the public tenant endpoint on the published-only service path', async () => {
    currentUser = undefined;
    await request(app.getHttpServer())
      .get(`/design/public/${TENANT_A}`)
      .expect(200)
      .expect({ marker: 'tenant-published' });

    expect(service.getPublishedDesign).toHaveBeenCalledWith(TENANT_A);
    expect(service.getDesign).not.toHaveBeenCalled();
  });
});
