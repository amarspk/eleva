import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSION_KEY = 'require_permission';

export interface RequiredPermission {
  action: string;
  resource: string;
}

/**
 * Decorator to require granular CASL actions and resource permissions on endpoints.
 * E.g., @RequirePermission('update', 'Product')
 */
export const RequirePermission = (action: string, resource: string): ReturnType<typeof SetMetadata<RequiredPermission>> =>
  SetMetadata(REQUIRE_PERMISSION_KEY, { action, resource });
