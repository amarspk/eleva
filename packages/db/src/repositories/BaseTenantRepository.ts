import { dbTenantContext } from '../index';

export interface PrismaModelDelegate<T extends { id: string } = { id: string }> {
  findFirst: (args: Record<string, unknown>) => Promise<T | null>;
  findMany: (args: Record<string, unknown>) => Promise<T[]>;
  create: (args: Record<string, unknown>) => Promise<T>;
  update: (args: Record<string, unknown>) => Promise<T>;
  delete: (args: Record<string, unknown>) => Promise<T>;
  count: (args: Record<string, unknown>) => Promise<number>;
}

export abstract class BaseTenantRepository<TModel extends { id: string }> {
  protected readonly delegate: PrismaModelDelegate<TModel>;

  // FIX(CAT-1a): accept the delegate as `unknown` and unify at the single choke
  // point. The $extended tenant-scoped client's delegates
  // (`DynamicModelExtensionThis<…>` with `Exact<A, …Args>` generic params) are
  // structurally incompatible with ANY hand-written structural delegate
  // interface (arrow-property params are checked contravariantly and
  // `Record<string, unknown>` is not assignable to the extension's
  // `{ [x: string]: {} }` index params), which produced TS2345 at all 16
  // TenantXRepository `super(prisma.<model>)` call sites. `unknown` + one
  // internal assertion keeps the repository contract (`PrismaModelDelegate`)
  // intact for every subclass/super-method usage while restoring assignability.
  /**
   * Whether the backing model carries a nullable `deletedAt` column.
   *
   * DOC-002 §"Soft Delete Policy" requires every read against a soft-deletable
   * table (`tenants`, `users`, `restaurants`, `branches`, `categories`,
   * `products`, `customers`, `tables`) to filter `deleted_at IS NULL`. Base
   * reads previously omitted it, so soft-deleted rows stayed visible to staff
   * (runtime-proven: a product with `deletedAt` set was still returned by
   * `GET /api/v1/menu/products`).
   *
   * Opt-in rather than blanket, because most models (Order, OrderItem,
   * KitchenQueue, Payment, Invoice, Discount, Webhook, DeviceToken,
   * Notification, Media, ProductSize/Variant/Addon, AddonItem) have no such
   * column and filtering on it would raise `Unknown argument 'deletedAt'`.
   */
  protected readonly softDeletable: boolean = false;

  constructor(delegate: unknown) {
    this.delegate = delegate as PrismaModelDelegate<TModel>;
  }

  /**
   * Merges the caller's filter with the tenant scope and, for soft-deletable
   * models, the `deletedAt: null` predicate. An explicit `deletedAt` supplied
   * by the caller wins, so an admin/restore view can still opt in deliberately.
   */
  protected scopedWhere(where: Record<string, unknown>, tenantId: string | null): Record<string, unknown> {
    // Platform Owner (tenantId=null): no tenant scoping — see all tenants
    if (!tenantId) {
      const base: Record<string, unknown> = { ...where };
      if (this.softDeletable && !('deletedAt' in base)) {
        base.deletedAt = null;
      }
      return base;
    }
    const base: Record<string, unknown> = { ...where, tenantId };
    if (this.softDeletable && !('deletedAt' in base)) {
      base.deletedAt = null;
    }
    return base;
  }

  /**
   * Resolves the active tenantId from the thread-local AsyncLocalStorage context.
   * Throws a Fail-Safe block exception if called outside a valid context.
   */
  protected getTenantId(): string | null {
    const context = dbTenantContext.getStore();

    // Platform Owners have no tenant — allow unscoped access
    if (context?.isPlatformOwner && !context?.tenantId) {
      return null;
    }

    const tenantId = context?.tenantId;

    if (!tenantId) {
      throw new Error('Fail-Safe Block: Access denied due to missing or unresolved tenant context.');
    }

    return tenantId;
  }

  /**
   * Safe lookup by Primary Key (id), automatically scoped to the active tenant.
   */
  async findById(id: string): Promise<TModel | null> {
    const tenantId = this.getTenantId();
    return this.delegate.findFirst({
      where: this.scopedWhere({ id }, tenantId),
    });
  }

  /**
   * Default safety cap for repository list reads.
   *
   * Every `GET` list endpoint backed by this repository was unbounded, so a
   * tenant with a large table (orders in particular grow without limit) would
   * materialise the entire result set into memory and into one JSON response.
   * This is a backstop, not a pagination API: callers that need real paging
   * pass an explicit `take`/`skip` (see `UserService.findAll`). The cap only
   * applies when the caller supplied neither.
   */
  protected static readonly DEFAULT_MAX_ROWS = 500;

  /**
   * Safe lookup of arrays, automatically merging filters with tenantId constraints.
   *
   * `options` allows an explicit page window; when omitted a bounded default is
   * applied so no endpoint can return an unbounded result set.
   */
  async findMany(
    where: Record<string, unknown> = {},
    options: { take?: number; skip?: number; orderBy?: unknown } = {},
  ): Promise<TModel[]> {
    const tenantId = this.getTenantId();
    const args: Record<string, unknown> = {
      where: this.scopedWhere(where, tenantId),
      take: options.take ?? BaseTenantRepository.DEFAULT_MAX_ROWS,
    };
    if (options.skip !== undefined) {
      args.skip = options.skip;
    }
    if (options.orderBy !== undefined) {
      args.orderBy = options.orderBy;
    }
    return this.delegate.findMany(args);
  }

  /**
   * Safe creation, verifying and injecting tenantId directly into data payloads.
   */
  async create(data: Record<string, unknown>): Promise<TModel> {
    const tenantId = this.getTenantId();
    
    if (data.tenantId && data.tenantId !== tenantId) {
      throw new Error('Fail-Safe Block: Cross-tenant data insertion attempt detected and blocked.');
    }

    return this.delegate.create({
      data: { ...data, tenantId },
    });
  }

  /**
   * Safe updates using Prisma-supported patterns.
   * First validates the record ownership via findFirst inside the tenant scope.
   */
  async update(id: string, data: Record<string, unknown>): Promise<TModel> {
    const tenantId = this.getTenantId();
    
    // Validate record existence and tenant ownership
    const entity = await this.delegate.findFirst({
      where: this.scopedWhere({ id }, tenantId),
    });

    if (!entity) {
      throw new Error(`Fail-Safe Block: The requested resource with ID [${id}] was not found or is inaccessible under this tenant context.`);
    }

    // Execute standard update using the safe unique identifier
    return this.delegate.update({
      where: { id: entity.id },
      data,
    });
  }

  /**
   * Safe deletions using Prisma-supported patterns.
   * First validates the record ownership via findFirst inside the tenant scope.
   */
  async delete(id: string): Promise<TModel> {
    const tenantId = this.getTenantId();

    // Validate record existence and tenant ownership
    const entity = await this.delegate.findFirst({
      where: this.scopedWhere({ id }, tenantId),
    });

    if (!entity) {
      throw new Error(`Fail-Safe Block: The requested resource with ID [${id}] was not found or is inaccessible under this tenant context.`);
    }

    // Execute standard delete using the safe unique identifier
    return this.delegate.delete({
      where: { id: entity.id },
    });
  }

  /**
   * Tenant-scoped lookup that deliberately INCLUDES soft-deleted rows.
   *
   * AUDIT-006/007: `findById` filters `deletedAt: null` for soft-deletable
   * models, which is correct for every normal read but makes a soft-deleted row
   * unreachable — so a restore endpoint could never resolve its own target, and
   * the RBAC guard (which re-resolves `:id` before the ability check) would
   * reject the request with 404 before the handler ran.
   *
   * Tenant scoping is unchanged: the row is still constrained to the active
   * tenant, so this widens visibility only along the soft-delete axis and never
   * across tenants.
   */
  async findByIdIncludingDeleted(id: string): Promise<TModel | null> {
    const tenantId = this.getTenantId();
    // `scopedWhere` leaves an explicit `deletedAt` untouched, so passing
    // `undefined` (Prisma treats it as "no constraint") suppresses the filter.
    return this.delegate.findFirst({
      where: this.scopedWhere({ id, deletedAt: undefined }, tenantId),
    });
  }

  /**
   * Marks a record as soft-deleted (DOC-002 §2.8). The row is preserved so
   * historical orders that reference it stay intact and reportable; every
   * subsequent read is hidden by the `deletedAt: null` filter in `scopedWhere`.
   *
   * Idempotent by design: re-deleting an already-deleted row is a no-op that
   * returns the existing record rather than moving its tombstone timestamp,
   * so a duplicate/retried request cannot rewrite deletion history.
   */
  async softDelete(id: string, extraData: Record<string, unknown> = {}): Promise<TModel> {
    const entity = (await this.findByIdIncludingDeleted(id)) as
      | (TModel & { deletedAt?: Date | null })
      | null;

    if (!entity) {
      throw new Error(
        `Fail-Safe Block: The requested resource with ID [${id}] was not found or is inaccessible under this tenant context.`,
      );
    }

    if (entity.deletedAt) {
      return entity as TModel;
    }

    return this.delegate.update({
      where: { id: entity.id },
      data: { ...extraData, deletedAt: new Date() },
    });
  }

  /**
   * Clears the soft-delete tombstone, returning the record to active reads.
   *
   * Idempotent: restoring a record that is not deleted returns it unchanged.
   */
  async restore(id: string, extraData: Record<string, unknown> = {}): Promise<TModel> {
    const entity = (await this.findByIdIncludingDeleted(id)) as
      | (TModel & { deletedAt?: Date | null })
      | null;

    if (!entity) {
      throw new Error(
        `Fail-Safe Block: The requested resource with ID [${id}] was not found or is inaccessible under this tenant context.`,
      );
    }

    if (!entity.deletedAt) {
      return entity as TModel;
    }

    return this.delegate.update({
      where: { id: entity.id },
      data: { ...extraData, deletedAt: null },
    });
  }

  /**
   * Safe calculations counting, automatically appending tenantId to constraints.
   */
  async count(where: Record<string, unknown> = {}): Promise<number> {
    const tenantId = this.getTenantId();
    return this.delegate.count({
      where: this.scopedWhere(where, tenantId),
    });
  }
}
