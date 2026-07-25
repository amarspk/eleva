import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class MockJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    request.user = {
      tenantId: request.headers['x-tenant-id'] || 'tenant-test-001',
      userId: 'user-test-001',
      email: 'test@zayjar.com',
      roles: ['OWNER'],
    };
    return true;
  }
}

@Injectable()
export class MockRbacPermissionGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    return true;
  }
}

@Injectable()
export class MockRateLimitGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    return true;
  }
}
