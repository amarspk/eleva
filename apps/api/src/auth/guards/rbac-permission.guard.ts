import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { subject } from '@casl/ability';
import { CaslAbilityFactory, Action, Subjects } from '../casl-ability.factory';
import { REQUIRE_PERMISSION_KEY, RequiredPermission } from '../decorators/require-permission.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedRequest } from '../../common/types/request.types';
import {
  TenantProductRepository,
  TenantOrderRepository,
  TenantBranchRepository,
  TenantUserRepository,
  TenantTableRepository,
  prisma,
} from '@zayjar/db';

// ==========================================
// Strongly-Typed Repository Registry
// ==========================================
const tenantRepositoryRegistry = {
  Product: new TenantProductRepository(),
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
      let realEntity: Record<string, unknown> | null = null;

      // A. Tenant-scoped models utilize strongly typed repositories
      if (resource !== 'Tenant') {
        const repository = (tenantRepositoryRegistry as Record<string, { findById: (id: string) => Promise<Record<string, unknown> | null> }>)[resource];
        if (repository) {
          // repository.findById automatically checks AsyncLocalStorage context
          realEntity = await repository.findById(recordId);
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
    const hasPermission = ability.can(action, subject(resource, resourceInstance));
    if (!hasPermission) {
      throw new ForbiddenException(
        `Access Denied: Your credentials lack the mandatory privilege [${action} on ${resource}].`
      );
    }

    return true;
  }
}
