import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { subject } from '@casl/ability';
import { CaslAbilityFactory, Action, Subjects } from '../casl-ability.factory';
import { REQUIRE_PERMISSION_KEY, RequiredPermission } from '../decorators/require-permission.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { INCLUDE_SOFT_DELETED_KEY } from '../decorators/include-soft-deleted.decorator';
import { AuthenticatedRequest } from '../../common/types/request.types';
import {
  TenantProductRepository,
  TenantCategoryRepository,
  TenantCustomerRepository,
  TenantRestaurantRepository,
  TenantOrderRepository,
  TenantBranchRepository,
  TenantUserRepository,
  TenantTableRepository,
  prisma,
} from '@zayjar/db';

// ==========================================
// Strongly-Typed Repository Registry
// ==========================================
/**
 * Accepts any RFC-4122 UUID shape. Used only to short-circuit obviously
 * invalid path params before they reach a `@db.Uuid` column.
 */
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const tenantRepositoryRegistry = {
  Product: new TenantProductRepository(),
  // AUDIT-006/007: `Category` joins the registry so `PUT/DELETE
  // /menu/categories/:id` re-resolve the real row under tenant scope before the
  // ability check, exactly like the other subjects. Without an entry here the
  // guard would silently fall through to the client-supplied body/params as the
  // ability subject (`realEntity` stays null only when a repository exists), so
  // registering it is what makes the cross-tenant 404 authoritative.
  Category: new TenantCategoryRepository(),
  // AUDIT-014: `Customer` joins the registry so `PUT/DELETE /customers/:id`
  // re-resolve the real row under tenant scope before the ability check.
  Customer: new TenantCustomerRepository(),
  // AUDIT-014 DEFECT-L: without this entry the guard cannot resolve a
  // restaurant `:id` and every read 404s.
  Restaurant: new TenantRestaurantRepository(),
  Order: new TenantOrderRepository(),
  Branch: new TenantBranchRepository(),
  User: new TenantUserRepository(),
  Table: new TenantTableRepository(),
} as const;

@Injectable()
export class RbacPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly caslAbilityFactory: CaslAbilityFactory,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Bypass authorization gates globally on public-facing routes
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // 2. Fetch the required permission configurations
    const requiredPermission = this.reflector.get<RequiredPermission>(
      REQUIRE_PERMISSION_KEY,
      context.getHandler(),
    );
    if (!requiredPermission) {
      return true; // No special permissions required
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication credentials were not resolved before authorization guards.');
    }

    // 3. Build active user capabilities
    const ability = this.caslAbilityFactory.createForUser(user);

    const action = requiredPermission.action as Action;
    const resource = requiredPermission.resource as Subjects;

    // ==========================================
    // REFINEMENT: Authoritative Database Scoping via Repository Layer
    // ==========================================
    let resourceInstance: Record<string, unknown> = {
      __type: resource,
      ...(request.params || {}),
      ...(request.body || {}),
    };

    const recordId = request.params?.id || request.body?.id;
    if (recordId && (action === 'update' || action === 'delete' || action === 'read')) {
      // Guards run BEFORE pipes in Nest, so a route-level ParseUUIDPipe cannot
      // protect this lookup: a malformed id reaches Prisma and surfaces as
      // `Inconsistent column data: Error creating UUID` — an unhandled HTTP 500
      // (reproduced on the pre-existing `/orders/1000` as well as `/users/1000`
      // during the AUDIT-004 architecture review). Every id column in the
      // schema is `@db.Uuid`, so a non-UUID can never match a row: reject it
      // as a clean 404 instead of leaking a database error. Well-formed ids are
      // unaffected, so no existing behaviour changes.
      if (!UUID_PATTERN.test(String(recordId))) {
        throw new NotFoundException(`The requested ${resource} with ID [${recordId}] was not found.`);
      }

      let realEntity: Record<string, unknown> | null = null;

      // A. Tenant-scoped models utilize strongly typed repositories
      if (resource !== 'Tenant') {
        const repository = (
          tenantRepositoryRegistry as Record<
            string,
            {
              findById: (id: string) => Promise<Record<string, unknown> | null>;
              findByIdIncludingDeleted: (id: string) => Promise<Record<string, unknown> | null>;
            }
          >
        )[resource];
        if (repository) {
          // AUDIT-006/007: restore endpoints legitimately target soft-deleted
          // rows, which `findById` filters out — the guard would 404 before the
          // handler ran (runtime-proven). `@IncludeSoftDeleted()` opts a single
          // handler into the widened lookup; tenant scoping is identical in
          // both branches, so cross-tenant access is still impossible.
          const includeSoftDeleted = this.reflector.getAllAndOverride<boolean>(
            INCLUDE_SOFT_DELETED_KEY,
            [context.getHandler(), context.getClass()],
          );
          // repository.findById automatically checks AsyncLocalStorage context
          realEntity = includeSoftDeleted
            ? await repository.findByIdIncludingDeleted(recordId)
            : await repository.findById(recordId);
        }
      } 
      // B. Global platform models query Prisma directly (preserving findUnique index seeks)
      else {
        realEntity = await prisma.tenant.findUnique({
          where: { id: recordId }
        }) as unknown as Record<string, unknown> | null;
      }

      if (!realEntity) {
        throw new NotFoundException(`The requested ${resource} with ID [${recordId}] was not found.`);
      }

      // Overwrite client values with real, database-sourced parameters
      resourceInstance = {
        ...realEntity,
        __type: resource,
      };
    }

    // 5. Verify capability criteria matches exactly (including dynamic attribute checks)
    // CAT-5: @casl/ability v7 types `can(action, subject)` params as the raw tuple
    // `Subjects` and no longer accepts the `ForcedSubject` instance returned by
    // `subject()` for pure string-subject abilities (v6 did). The runtime path is
    // identical — `subject()` stamps `__caslSubjectType__` and v7's matcher reads it.
    const hasPermission = ability.can(action, subject(resource, resourceInstance) as unknown as Subjects);
    if (!hasPermission) {
      throw new ForbiddenException(
        `Access Denied: Your credentials lack the mandatory privilege [${action} on ${resource}].`
      );
    }

    return true;
  }
}
