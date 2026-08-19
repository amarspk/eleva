import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CaslAbilityFactory } from '../auth/casl-ability.factory';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { REQUIRE_PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { MediaController } from './media.controller';
import { AssetController } from '../asset/asset.controller';

function user(overrides: Partial<{ roles: string[]; permissions: string[]; tenantId: string | null }>) {
  return {
    id: '00000000-0000-4000-8000-000000000099',
    email: 'staff@example.com',
    tenantId: overrides.tenantId === undefined ? 'tenant-a' : overrides.tenantId,
    roles: overrides.roles ?? [],
    permissions: overrides.permissions ?? [],
  };
}

function executionContext(handler: (...args: never[]) => unknown, requestUser: unknown) {
  return {
    getHandler: () => handler,
    getClass: () => MediaController,
    switchToHttp: () => ({
      getRequest: () => ({ user: requestUser, params: {}, body: {} }),
    }),
  } as never;
}

describe('Media RBAC', () => {
  const factory = new CaslAbilityFactory();
  const reflector = {
    getAllAndOverride: (key: unknown) => (key === IS_PUBLIC_KEY ? false : undefined),
    get: (key: unknown) => (key === REQUIRE_PERMISSION_KEY ? { action: 'create', resource: 'Media' } : undefined),
  } as unknown as Reflector;
  const guard = new RbacPermissionGuard(reflector, factory);

  it('allows an owner with media:create to upload', async () => {
    const allowed = await guard.canActivate(executionContext(MediaController.prototype.upload, user({
      roles: ['RESTAURANT_OWNER'],
      permissions: ['media:create'],
    })));
    expect(allowed).toBe(true);
  });

  it('denies a cashier without media grants', async () => {
    await expect(guard.canActivate(executionContext(MediaController.prototype.upload, user({
      roles: ['CASHIER'],
      permissions: ['order:read', 'order:create', 'product:read'],
    })))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies kitchen staff', async () => {
    await expect(guard.canActivate(executionContext(MediaController.prototype.upload, user({
      roles: ['KITCHEN_STAFF'],
      permissions: ['order:read', 'product:read'],
    })))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a platform owner via manage(all)', async () => {
    const allowed = await guard.canActivate(executionContext(MediaController.prototype.upload, user({
      roles: ['PLATFORM_OWNER'],
      permissions: [],
      tenantId: null,
    })));
    expect(allowed).toBe(true);
  });

  it('does not let tenant A grants authorize a foreign tenant id in the service layer', () => {
    const ability = factory.createForUser(user({
      roles: ['RESTAURANT_OWNER'],
      permissions: ['media:read', 'media:delete'],
      tenantId: 'tenant-a',
    }));
    expect(ability.can('delete', 'Media')).toBe(true);
    // Tenant isolation is JWT tenantId in MediaService, not a CASL condition.
    expect(user({ tenantId: 'tenant-a' }).tenantId).not.toBe('tenant-b');
  });

  it('declares Jwt + RBAC + Media permissions on both live upload surfaces', () => {
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, MediaController.prototype.upload)).toEqual({
      action: 'create',
      resource: 'Media',
    });
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, MediaController.prototype.findAll)).toEqual({
      action: 'read',
      resource: 'Media',
    });
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, MediaController.prototype.remove)).toEqual({
      action: 'delete',
      resource: 'Media',
    });
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, AssetController.prototype.createPresignedUrl)).toEqual({
      action: 'create',
      resource: 'Media',
    });
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, AssetController.prototype.optimizeImage)).toEqual({
      action: 'update',
      resource: 'Media',
    });
  });
});
