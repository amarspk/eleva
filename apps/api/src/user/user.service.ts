import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { prisma } from '@zayjar/db';
import { AuthService } from '../auth/auth.service';
import { CreateUserRequestDto } from './dto/create-user-request.dto';
import { UpdateUserRequestDto } from './dto/update-user-request.dto';

/**
 * Public shape of a staff user. `passwordHash`, `mfaSecret` and other secrets
 * are never included — every read path funnels through `toResponse`.
 */
export interface UserResponse {
  id: string;
  tenantId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string | null;
  isActive: boolean;
  mfaEnabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles: string[];
  branchIds: string[];
}

interface UserRoleRow {
  role: { id: string; name: string };
}

interface UserBranchRow {
  branchId: string;
}

interface UserWithRelations {
  id: string;
  tenantId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string | null;
  isActive: boolean;
  mfaEnabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  userRoles?: UserRoleRow[];
  userBranches?: UserBranchRow[];
}

/**
 * The subset of the tenant-scoped Prisma client used inside this service's
 * interactive transactions.
 *
 * Declared once instead of re-casting `tx` inline at each call site (the
 * previous shape duplicated the same structural type three times). `$executeRaw`
 * is required for the per-tenant advisory lock that makes the last-owner guard
 * race-safe.
 */
export interface TenantScopedTx {
  $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
  user: {
    findFirst: (args: Record<string, unknown>) => Promise<{ id: string } | null>;
    create: (args: Record<string, unknown>) => Promise<UserWithRelations>;
    update: (args: Record<string, unknown>) => Promise<unknown>;
    count: (args: Record<string, unknown>) => Promise<number>;
  };
  role: { findMany: (args: Record<string, unknown>) => Promise<Array<{ id: string; name: string }>> };
  branch: { findMany: (args: Record<string, unknown>) => Promise<Array<{ id: string }>> };
}

/**
 * The authenticated caller performing the operation. Supplied by the
 * controller from the signature-verified JWT — never from the request body.
 * Used for the privilege-escalation gate (ISSUE-3) and self-action guards.
 */
export interface ActorContext {
  id: string;
  roles: string[];
  /** Flat `resource:action` strings from the verified JWT. */
  permissions: string[];
}

/**
 * Staff user management (AUDIT-004).
 *
 * Before this service the platform could not create a user: the only
 * `user.create` in the codebase was the owner row written inside tenant
 * onboarding, so the Cashier and Backoffice login screens had no accounts to
 * authenticate. This closes that gap with full CRUD.
 *
 * Isolation guarantees:
 * - **Tenant** — every query is filtered by the caller's verified JWT tenant
 *   (`tenantId` is never read from the request body). Reads additionally go
 *   through explicit `tenantId` predicates so a cross-tenant id resolves to
 *   404, not 403, and therefore leaks nothing about other tenants' data.
 * - **Branch** — branch assignments are validated to belong to the same tenant
 *   before being written (DOC-005 §4.2).
 * - **Soft delete** — `deletedAt` is honoured per DOC-002 §deletion policy;
 *   soft-deleted users are invisible to every read path.
 */
@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  /**
   * Relations needed to build a `UserResponse`.
   *
   * ISSUE-5: `userBranches` is filtered to live branches. A soft-deleted
   * branch must not keep appearing in a user's effective scope — the same
   * `deletedAt: null` predicate `assertBranchesInTenant` applies on write.
   */
  /**
   * Interactive-transaction budget for the write paths.
   *
   * These transactions take a per-tenant advisory lock and also perform a
   * bounded session-store write, so the default 5s budget is tightened
   * deliberately: `maxWait` caps how long a request queues behind another
   * tenant-scoped writer, and `timeout` caps the critical section itself.
   * Both are far above the observed p99 (single-digit ms) and exist so a
   * degraded dependency fails fast and visibly instead of pinning the lock.
   */
  private static readonly TX_OPTIONS = { maxWait: 5000, timeout: 10000 } as const;

  /** Default page size for `findAll`, matching `audit.service.ts`. */
  private static readonly DEFAULT_PAGE_SIZE = 100;

  /** Hard ceiling so a caller cannot request an unbounded page. */
  private static readonly MAX_PAGE_SIZE = 200;

  private static readonly USER_INCLUDE = {
    userRoles: { include: { role: true } },
    userBranches: { where: { branch: { deletedAt: null } } },
  } as const;

  constructor(private readonly authService: AuthService) {}

  /**
   * Maps a persisted user row to its public representation.
   * Secrets (`passwordHash`, `mfaSecret`) are structurally excluded.
   */
  private toResponse(user: UserWithRelations): UserResponse {
    return {
      id: user.id,
      tenantId: user.tenantId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber ?? null,
      isActive: user.isActive,
      mfaEnabled: user.mfaEnabled,
      lastLoginAt: user.lastLoginAt ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      roles: (user.userRoles ?? []).map((ur) => ur.role.name),
      branchIds: (user.userBranches ?? []).map((ub) => ub.branchId),
    };
  }

  private assertTenant(tenantId: string | null | undefined): string {
    if (!tenantId) {
      throw new ForbiddenException('Access denied: Missing valid tenant context.');
    }
    return tenantId;
  }

  /**
   * Privilege-escalation gate (AUDIT-004 architecture review, ISSUE-3).
   *
   * `user:update` is a single flat permission, so without this check ANY holder
   * of it could grant `RESTAURANT_OWNER` — to another account or to themselves.
   * Runtime-verified pre-fix: a MANAGER delegated `user:read`+`user:update`
   * promoted herself to RESTAURANT_OWNER and re-logged in holding all 26 owner
   * permissions including `tenant:update` and `user:delete`.
   *
   * Rule: you may only grant a role you already hold. PLATFORM_OWNER is exempt
   * (documented cross-tenant administrative capability, consistent with
   * `JwtStrategy` and `CaslAbilityFactory`), and `PLATFORM_OWNER` itself is
   * never grantable through this tenant-scoped surface.
   */
  private async assertCanGrantRoles(
    tenantId: string,
    requestedRoles: string[],
    actor: ActorContext,
  ): Promise<void> {
    const actorRoles = actor?.roles ?? [];
    if (actorRoles.includes('PLATFORM_OWNER')) {
      return;
    }

    // The platform-owner role is a global capability and must never be
    // obtainable from a tenant-scoped endpoint, regardless of the actor.
    if (requestedRoles.includes('PLATFORM_OWNER')) {
      throw new ForbiddenException(
        'Access Denied: the PLATFORM_OWNER role cannot be assigned through tenant user management.',
      );
    }

    const requested = [...new Set(requestedRoles)];
    if (requested.length === 0) {
      return;
    }

    // Roles the actor already holds are always grantable (delegating your own
    // level is not escalation).
    const held = new Set(actorRoles);
    const unheld = requested.filter((r) => !held.has(r));
    if (unheld.length === 0) {
      return;
    }

    // Otherwise compare CAPABILITY, not role names: a role may be granted only
    // if its permission set is a subset of the actor's own. This lets a
    // RESTAURANT_OWNER (26 permissions) create a MANAGER (12) or CASHIER (6),
    // while blocking a MANAGER from minting a RESTAURANT_OWNER — the exact
    // escalation reproduced live during the architecture review, where a
    // manager delegated `user:update` promoted herself to owner.
    const actorPermissions = new Set(actor.permissions ?? []);

    const targetRoles = await prisma.role.findMany({
      where: { tenantId, name: { in: unheld } },
      include: { rolePermissions: { include: { permission: true } } },
    });

    for (const role of targetRoles) {
      const rolePerms = (role.rolePermissions ?? []).map(
        (rp) => `${rp.permission.resource}:${rp.permission.action}`,
      );
      const exceeds = rolePerms.filter((p) => !actorPermissions.has(p));
      if (exceeds.length > 0) {
        throw new ForbiddenException(
          `Access Denied: you cannot grant the role '${role.name}' because it carries privileges you do not hold: ${exceeds
            .slice(0, 5)
            .join(', ')}.`,
        );
      }
    }
  }

  /**
   * Lockout guard (AUDIT-004 architecture review, ISSUE-4).
   *
   * Prevents removing the last active RESTAURANT_OWNER of a tenant by
   * deletion, deactivation, or role replacement. Without it a tenant could be
   * left with no administrator and no in-product way to recover.
   */
  private async assertNotLastOwner(
    tx: TenantScopedTx,
    tenantId: string,
    targetUserId: string,
    targetRoles: string[],
    action: 'remove' | 'deactivate' | 'change roles for',
  ): Promise<void> {
    if (!targetRoles.includes('RESTAURANT_OWNER')) {
      return;
    }

    // Serialize every owner-count check for this tenant.
    //
    // The count below is a read-then-write decision (TOCTOU). Without a lock
    // two concurrent requests each see "one other owner remains", both pass,
    // and both commit — leaving the tenant with ZERO owners and no in-product
    // recovery. Runtime-reproduced during this review: two parallel
    // `PUT /users/:id {isActive:false}` calls against the last two owners both
    // returned HTTP 200 and the tenant was left with 0 active owners.
    //
    // `pg_advisory_xact_lock` takes a transaction-scoped lock released
    // automatically on COMMIT/ROLLBACK (no leak path). The key is derived from
    // the tenant UUID via hashtext so the lock is per-tenant: operations in
    // different tenants never serialize against each other. The lock must be
    // taken BEFORE the count, and the mutation must happen in the SAME
    // transaction, for the guard to be sound.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`zayjar:owner-guard:${tenantId}`}))`;

    const remainingOwners = await tx.user.count({
      where: {
        tenantId,
        deletedAt: null,
        isActive: true,
        id: { not: targetUserId },
        userRoles: { some: { role: { name: 'RESTAURANT_OWNER', tenantId } } },
      },
    });

    if (remainingOwners === 0) {
      throw new BadRequestException(
        `Cannot ${action} the last active RESTAURANT_OWNER of this tenant. Assign the role to another active user first.`,
      );
    }
  }

  /**
   * Resolves role names to this tenant's role rows.
   * Unknown names fail loudly: silently dropping a role would hand back a user
   * that looks provisioned but cannot act.
   */
  private async resolveRoleIds(
    tx: {
      role: { findMany: (args: Record<string, unknown>) => Promise<Array<{ id: string; name: string }>> };
    },
    tenantId: string,
    roleNames: string[],
  ): Promise<string[]> {
    const unique = [...new Set(roleNames)];
    if (unique.length === 0) {
      return [];
    }

    const roles = await tx.role.findMany({
      where: { tenantId, name: { in: unique } },
    });

    const found = new Set(roles.map((r) => r.name));
    const missing = unique.filter((n) => !found.has(n));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Unknown role(s) for this tenant: ${missing.join(', ')}.`,
      );
    }

    return roles.map((r) => r.id);
  }

  /**
   * Verifies every requested branch belongs to the caller's tenant.
   * A branch id from another tenant is rejected rather than ignored — this is
   * the branch-isolation boundary.
   */
  private async assertBranchesInTenant(
    tx: {
      branch: { findMany: (args: Record<string, unknown>) => Promise<Array<{ id: string }>> };
    },
    tenantId: string,
    branchIds: string[],
  ): Promise<string[]> {
    const unique = [...new Set(branchIds)];
    if (unique.length === 0) {
      return [];
    }

    const branches = await tx.branch.findMany({
      where: { id: { in: unique }, tenantId, deletedAt: null },
    });

    const found = new Set(branches.map((b) => b.id));
    const missing = unique.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Unknown or inaccessible branch(es) for this tenant: ${missing.join(', ')}.`,
      );
    }

    return unique;
  }

  /**
   * Creates a staff user, assigns roles and branch scopes atomically.
   */
  async createUser(
    dto: CreateUserRequestDto,
    tenantIdInput: string | null,
    actor: ActorContext,
  ): Promise<UserResponse> {
    const tenantId = this.assertTenant(tenantIdInput);
    const email = dto.email.toLowerCase().trim();

    // ISSUE-3: refuse before doing any work (including the costly hash).
    await this.assertCanGrantRoles(tenantId, dto.roles ?? [], actor);

    // Argon2id hashing happens before the transaction: it is intentionally slow
    // (65 MB / 3 passes) and must not hold a DB transaction open.
    const passwordHash = await this.authService.hashPassword(dto.password);

    const roleNames = dto.roles ?? [];
    const branchIds = dto.branchIds ?? [];

    const created = await prisma.$transaction(async (tx) => {
      const txc = tx as unknown as TenantScopedTx;

      // The DB carries a unique index on (email, tenantId); check first so the
      // caller receives a precise 409 instead of a raw constraint violation.
      const existing = await txc.user.findFirst({ where: { email, tenantId } });
      if (existing) {
        throw new ConflictException('An account with this email address already exists.');
      }

      const roleIds = await this.resolveRoleIds(txc, tenantId, roleNames);
      const validBranchIds = await this.assertBranchesInTenant(txc, tenantId, branchIds);

      // Role/branch links are written as NESTED creates under the User rather
      // than as direct `userRole.create` / `userBranch.create` calls. This is
      // deliberate and load-bearing: the tenant-scoping Prisma extension
      // (`packages/db/src/index.ts`) injects `tenantId` into `data` for every
      // top-level create on a scoped model, and `UserRole` has no `tenantId`
      // column — a direct create therefore fails with
      // `Unknown argument 'tenantId'`. Nested writes are carried inside the
      // parent User operation, so the extension scopes the parent (its own
      // `data.tenantId` injection still applies) and leaves the nested payload
      // untouched. Isolation is preserved: the parent create is tenant-stamped,
      // roleIds were resolved under `tenantId`, and branchIds were validated
      // against the tenant above.
      return txc.user.create({
        data: {
          tenantId,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email,
          passwordHash,
          phoneNumber: dto.phoneNumber ?? null,
          isActive: dto.isActive ?? true,
          ...(roleIds.length > 0
            ? { userRoles: { create: roleIds.map((roleId) => ({ roleId })) } }
            : {}),
          ...(validBranchIds.length > 0
            ? {
                userBranches: {
                  create: validBranchIds.map((branchId) => ({ branchId, tenantId })),
                },
              }
            : {}),
        },
      });
    });

    this.logger.log(`Created staff user [${created.id}] for tenant [${tenantId}]`);
    return this.findOne(created.id, tenantId);
  }

  /**
   * Lists staff users for the caller's tenant. Soft-deleted rows are excluded.
   *
   * Paginated by construction. The first implementation issued an unbounded
   * `findMany`, so a tenant with a large staff roster would materialise every
   * row — each with its `userRoles`/`userBranches` relations — into memory and
   * into a single JSON response. `limit` is clamped to
   * `MAX_PAGE_SIZE` so a caller cannot opt out by sending `?limit=100000`.
   * Follows the existing convention in `audit.service.ts` (`take: limit || 100`),
   * extended with `skip` so the list is actually navigable.
   */
  async findAll(
    tenantIdInput: string | null,
    filters: { isActive?: boolean; branchId?: string; limit?: number; offset?: number } = {},
  ): Promise<UserResponse[]> {
    const tenantId = this.assertTenant(tenantIdInput);

    const where: Record<string, unknown> = { tenantId, deletedAt: null };
    if (typeof filters.isActive === 'boolean') {
      where.isActive = filters.isActive;
    }
    if (filters.branchId) {
      where.userBranches = { some: { branchId: filters.branchId, tenantId } };
    }

    const take = Math.min(
      Math.max(filters.limit ?? UserService.DEFAULT_PAGE_SIZE, 1),
      UserService.MAX_PAGE_SIZE,
    );
    const skip = Math.max(filters.offset ?? 0, 0);

    const users = (await prisma.user.findMany({
      where,
      include: UserService.USER_INCLUDE,
      // `createdAt` alone is not a total order (bulk-provisioned staff can share
      // a timestamp), which makes paging non-deterministic and can repeat or
      // skip rows across pages. `id` is the unique tiebreaker.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      skip,
    })) as unknown as UserWithRelations[];

    return users.map((u) => this.toResponse(u));
  }

  /**
   * Fetches one staff user scoped to the caller's tenant.
   * A valid id belonging to another tenant yields 404 — never 403 — so the
   * endpoint cannot be used to probe for the existence of foreign records.
   */
  async findOne(id: string, tenantIdInput: string | null): Promise<UserResponse> {
    const tenantId = this.assertTenant(tenantIdInput);

    const user = (await prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: UserService.USER_INCLUDE,
    })) as unknown as UserWithRelations | null;

    if (!user) {
      throw new NotFoundException(`The requested User with ID [${id}] was not found.`);
    }

    return this.toResponse(user);
  }

  /**
   * Applies a partial update. Roles and branches are replaced only when the
   * corresponding key is present in the payload.
   */
  async updateUser(
    id: string,
    dto: UpdateUserRequestDto,
    tenantIdInput: string | null,
    actor: ActorContext,
  ): Promise<UserResponse> {
    const tenantId = this.assertTenant(tenantIdInput);

    // ISSUE-3: gate role grants before any mutation or hashing.
    if (dto.roles !== undefined) {
      await this.assertCanGrantRoles(tenantId, dto.roles, actor);
    }

    // Ownership check first — outside the transaction and before any hashing.
    // This also gives us the CURRENT role/branch sets, read through the
    // tenant-scoped `user.findFirst` include. Reading the join tables directly
    // is not possible: the tenant extension injects `tenantId` into the WHERE
    // clause of every scoped-model query, and `UserRole` has no such column.
    const currentState = await this.findOne(id, tenantId);

    const passwordHash = dto.password
      ? await this.authService.hashPassword(dto.password)
      : undefined;

    // Deactivation, password rotation and role changes all invalidate tokens
    // already in circulation. Runtime-verified pre-fix: a user deactivated via
    // `isActive:false` kept working (200 on /branches) for the remainder of the
    // 15-minute token life. Role changes are included because JWT claims are a
    // snapshot — a demoted user would otherwise keep the old (higher)
    // permission set until expiry.
    const securityRelevantChange =
      dto.isActive === false || dto.password !== undefined || dto.roles !== undefined;

    await prisma.$transaction(async (tx) => {
      const txc = tx as unknown as TenantScopedTx;

      // ISSUE-4 (race-safe): the last-owner guard must run INSIDE the same
      // transaction as the mutation it protects, otherwise two concurrent
      // requests can both observe a surviving owner and both commit.
      if (dto.isActive === false) {
        await this.assertNotLastOwner(txc, tenantId, id, currentState.roles, 'deactivate');
      }
      if (dto.roles !== undefined && !dto.roles.includes('RESTAURANT_OWNER')) {
        await this.assertNotLastOwner(txc, tenantId, id, currentState.roles, 'change roles for');
      }

      if (dto.email) {
        const email = dto.email.toLowerCase().trim();
        const clash = await txc.user.findFirst({
          where: { email, tenantId, NOT: { id } },
        });
        if (clash) {
          throw new ConflictException('An account with this email address already exists.');
        }
      }

      const data: Record<string, unknown> = {};
      if (dto.firstName !== undefined) {
        data.firstName = dto.firstName;
      }
      if (dto.lastName !== undefined) {
        data.lastName = dto.lastName;
      }
      if (dto.email !== undefined) {
        data.email = dto.email.toLowerCase().trim();
      }
      if (dto.phoneNumber !== undefined) {
        data.phoneNumber = dto.phoneNumber;
      }
      if (dto.isActive !== undefined) {
        data.isActive = dto.isActive;
      }
      if (passwordHash) {
        data.passwordHash = passwordHash;
      }

      if (Object.keys(data).length > 0) {
        await txc.user.update({ where: { id }, data });
      }

      // Role/branch replacement uses NESTED writes on the tenant-scoped User
      // update for the same reason as createUser: the tenant extension injects
      // `tenantId` into top-level creates on scoped models, and the join tables
      // (`UserRole` especially) do not all carry that column. Routing through
      // the parent keeps the WHERE clause tenant-scoped — so a foreign user id
      // simply matches nothing — while leaving nested payloads untouched.

      // Role replacement (set semantics) — only when the key was supplied.
      if (dto.roles !== undefined) {
        const desiredRoleIds = await this.resolveRoleIds(txc, tenantId, dto.roles);
        const desired = new Set(desiredRoleIds);
        // Current role IDs resolved from the tenant-scoped read above.
        const currentRoleRows = await txc.role.findMany({
          where: { tenantId, name: { in: currentState.roles } },
        });
        const currentIds = new Set(currentRoleRows.map((r) => r.id));

        const toRemove = currentRoleRows
          .filter((r) => !desired.has(r.id))
          .map((r) => r.id);
        const toAdd = desiredRoleIds.filter((roleId) => !currentIds.has(roleId));

        if (toRemove.length > 0 || toAdd.length > 0) {
          await txc.user.update({
            where: { id },
            data: {
              userRoles: {
                ...(toRemove.length > 0
                  ? { deleteMany: toRemove.map((roleId) => ({ roleId })) }
                  : {}),
                ...(toAdd.length > 0 ? { create: toAdd.map((roleId) => ({ roleId })) } : {}),
              },
            },
          });
        }
      }

      // Branch replacement (set semantics) — only when the key was supplied.
      if (dto.branchIds !== undefined) {
        const desiredBranchIds = await this.assertBranchesInTenant(txc, tenantId, dto.branchIds);
        const desired = new Set(desiredBranchIds);
        // Current branch IDs from the tenant-scoped read above (same reason as roles).
        const currentBranchIds = currentState.branchIds;
        const currentIds = new Set(currentBranchIds);

        const toRemove = currentBranchIds.filter((branchId) => !desired.has(branchId));
        const toAdd = desiredBranchIds.filter((branchId) => !currentIds.has(branchId));

        if (toRemove.length > 0 || toAdd.length > 0) {
          await txc.user.update({
            where: { id },
            data: {
              userBranches: {
                ...(toRemove.length > 0
                  ? { deleteMany: toRemove.map((branchId) => ({ branchId })) }
                  : {}),
                ...(toAdd.length > 0
                  ? { create: toAdd.map((branchId) => ({ branchId, tenantId })) }
                  : {}),
              },
            },
          });
        }
      }

      // Revoke INSIDE the transaction (same reasoning as deleteUser): if the
      // session store is unavailable the whole update rolls back rather than
      // leaving a user who is deactivated/demoted in the database while their
      // existing token still carries the old privileges.
      if (securityRelevantChange) {
        await this.authService.revokeAllUserTokens(id);
      }
    }, UserService.TX_OPTIONS);

    // ISSUE-2: deactivation, password rotation and role changes must all
    // invalidate tokens already in circulation. Runtime-verified pre-fix: a
    // user deactivated via `isActive:false` kept working (200 on /branches)
    // for the remainder of the 15-minute token life. Role changes are included
    // because JWT claims are a snapshot — a demoted user would otherwise keep
    // the old (higher) permission set until expiry.
    this.logger.log(
      `Updated staff user [${id}] for tenant [${tenantId}]` +
        (securityRelevantChange ? ' (tokens revoked)' : ''),
    );
    return this.findOne(id, tenantId);
  }

  /**
   * Soft-deletes a staff user (DOC-002 deletion policy) and deactivates the
   * account so existing credentials stop working immediately.
   *
   * Self-deletion is refused: an admin removing their own account would strand
   * a tenant with no reachable administrator.
   */
  async deleteUser(
    id: string,
    tenantIdInput: string | null,
    actor: ActorContext,
  ): Promise<{ id: string; deleted: true }> {
    const tenantId = this.assertTenant(tenantIdInput);

    if (id === actor.id) {
      throw new BadRequestException('You cannot delete your own account.');
    }

    const target = await this.findOne(id, tenantId);

    // ISSUE-4 (race-safe): the guard and the soft delete share one transaction
    // so a concurrent request cannot slip between the count and the write.
    await prisma.$transaction(async (tx) => {
      const txc = tx as unknown as TenantScopedTx;

      await this.assertNotLastOwner(txc, tenantId, id, target.roles, 'remove');

      await txc.user.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });

      // ISSUE-1: a soft delete must terminate access immediately. Without this
      // the victim's already-issued JWT stayed valid for up to 15 minutes
      // (runtime-verified pre-fix: 200 on /auth/me and /branches after delete).
      //
      // Revocation is performed INSIDE the transaction so the two outcomes stay
      // consistent: if the session store is unavailable `revokeAllUserTokens`
      // throws, the soft delete rolls back, and the caller gets a retryable 503
      // instead of a user who is "deleted" in the database but still holds a
      // working token. Deleting without revoking is the worse of the two
      // failure modes, so the operation fails closed as a unit.
      await this.authService.revokeAllUserTokens(id);
    }, UserService.TX_OPTIONS);

    this.logger.log(`Soft-deleted staff user [${id}] for tenant [${tenantId}] (tokens revoked)`);
    return { id, deleted: true };
  }

  /**
   * Replaces a user's role assignments (explicit endpoint for the
   * "assign roles" capability).
   */
  async assignRoles(
    id: string,
    roleNames: string[],
    tenantIdInput: string | null,
    actor: ActorContext,
  ): Promise<UserResponse> {
    return this.updateUser(id, { roles: roleNames }, tenantIdInput, actor);
  }

  /**
   * Replaces a user's branch assignments (DOC-005 §4.2 scoping).
   */
  async assignBranches(
    id: string,
    branchIds: string[],
    tenantIdInput: string | null,
    actor: ActorContext,
  ): Promise<UserResponse> {
    return this.updateUser(id, { branchIds }, tenantIdInput, actor);
  }
}
