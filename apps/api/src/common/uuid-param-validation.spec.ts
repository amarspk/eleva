import 'reflect-metadata';
import { TenantController } from '../tenant/tenant.controller';
import { WebhookController } from '../webhook/webhook.controller';
import { DeviceTokenController } from '../device-token/device-token.controller';
import { MenuController } from '../menu/menu.controller';
import { BranchController } from '../branch/branch.controller';
import { CustomerController } from '../customer/customer.controller';
import { UserController } from '../user/user.controller';

/**
 * AUDIT-014 DEFECT-M regression.
 *
 * Three routes reached Prisma with an unvalidated `:id` and leaked the database
 * error as an unhandled HTTP 500. Runtime-proven before the fix:
 *
 *   GET    /api/v1/tenants/NOT-A-UUID       -> 500
 *   DELETE /api/v1/webhooks/NOT-A-UUID      -> 500
 *   DELETE /api/v1/device-tokens/NOT-A-UUID -> 500
 *     "Inconsistent column data: Error creating UUID, invalid character…"
 *
 * (`/orders/:id` and `/media/:id` were already safe — the RBAC guard's
 * UUID_PATTERN check and an explicit tenant guard respectively — which is why
 * this test asserts the pipe metadata rather than blanket-checking every route.)
 *
 * Nest stores param pipes under `__routeArguments__`. Asserting on that
 * metadata means deleting a `ParseUUIDPipe` fails this suite instead of
 * silently re-opening the 500.
 */

// Nest's ROUTE_ARGS_METADATA key.
const ROUTE_ARGS = '__routeArguments__';

function paramPipeNames(controller: unknown, method: string): string[] {
  // Nest stores route-argument metadata on the CONSTRUCTOR keyed by method
  // name (verified empirically: keys look like "5:0" -> { pipes: [...] }).
  const meta = Reflect.getMetadata(ROUTE_ARGS, controller as object, method) as
    | Record<string, { pipes?: unknown[] }>
    | undefined;
  if (!meta) {
    return [];
  }
  const names: string[] = [];
  for (const entry of Object.values(meta)) {
    for (const pipe of entry.pipes ?? []) {
      const ctorName = (pipe as { constructor?: { name?: string } })?.constructor?.name;
      if (ctorName) {
        names.push(ctorName);
      }
    }
  }
  return names;
}

describe('DEFECT-M — :id params are UUID-validated before reaching Prisma', () => {
  it.each([
    [TenantController, 'getTenant'],
    [TenantController, 'updateTenant'],
    [WebhookController, 'deleteWebhook'],
    [DeviceTokenController, 'deleteToken'],
  ])('%p.%s applies ParseUUIDPipe', (controller, method) => {
    const names = paramPipeNames(controller, method as string);
    expect(names).toContain('ParseUUIDPipe');
  });
});

describe('previously-fixed controllers keep their ParseUUIDPipe', () => {
  it.each([
    [MenuController, 'updateProduct'],
    [MenuController, 'deleteProduct'],
    [MenuController, 'updateCategory'],
    [MenuController, 'deleteCategory'],
    [BranchController, 'updateBranch'],
    [BranchController, 'deleteBranch'],
    [BranchController, 'updateTable'],
    [BranchController, 'deleteTable'],
    [CustomerController, 'updateCustomer'],
    [CustomerController, 'deleteCustomer'],
    [UserController, 'updateUser'],
    [UserController, 'deleteUser'],
  ])('%p.%s applies ParseUUIDPipe', (controller, method) => {
    expect(paramPipeNames(controller, method as string)).toContain('ParseUUIDPipe');
  });
});
