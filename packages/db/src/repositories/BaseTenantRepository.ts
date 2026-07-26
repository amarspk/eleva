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
  constructor(protected readonly delegate: PrismaModelDelegate<TModel>) {}

  /**
   * Resolves the active tenantId from the thread-local AsyncLocalStorage context.
   * Throws a Fail-Safe block exception if called outside a valid context.
   */
  protected getTenantId(): string {
    const context = dbTenantContext.getStore();
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
      where: { id, tenantId },
    });
  }

  /**
   * Safe lookup of arrays, automatically merging filters with tenantId constraints.
   */
  async findMany(where: Record<string, unknown> = {}): Promise<TModel[]> {
    const tenantId = this.getTenantId();
    return this.delegate.findMany({
      where: { ...where, tenantId },
    });
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
      where: { id, tenantId },
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
      where: { id, tenantId },
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
   * Safe calculations counting, automatically appending tenantId to constraints.
   */
  async count(where: Record<string, unknown> = {}): Promise<number> {
    const tenantId = this.getTenantId();
    return this.delegate.count({
      where: { ...where, tenantId },
    });
  }
}
