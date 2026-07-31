import { CustomDecorator, SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSION_KEY = 'require_permission';

export interface RequiredPermission {
  action: string;
  resource: string;
}

/**
 * Decorator to require granular CASL actions and resource permissions on endpoints.
 * E.g., @RequirePermission('update', 'Product')
 */
// CAT-5: same `SetMetadata<K>` misuse as public.decorator.ts — annotate the real
// returned type `CustomDecorator<string>` (annotations erased at runtime).
export const RequirePermission = (action: string, resource: string): CustomDecorator<string> =>
  SetMetadata(REQUIRE_PERMISSION_KEY, { action, resource });
