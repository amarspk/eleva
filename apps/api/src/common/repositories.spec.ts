import {
  dbTenantContext,
  TenantProductRepository,
  TenantOrderRepository,
  prisma,
} from '@zayjar/db';

describe('BaseTenantRepository & TenantProductRepository Unit Tests', () => {
  let repository: TenantProductRepository;

  beforeEach(() => {
    repository = new TenantProductRepository();
    jest.restoreAllMocks();
  });

  it('1. tenantId is injected automatically inside repository queries', async () => {
    const tenantId = 'tenant-uuid-1111';
    
    // Spy on the Prisma findFirst model method
    const findFirstSpy = jest.spyOn(prisma.product, 'findFirst')
      .mockResolvedValue({ id: 'prod-1', tenantId } as any);

    await dbTenantContext.run({ tenantId }, async () => {
      // Act
      await repository.findById('prod-1');

      // Assert
      // DOC-002 §Soft Delete Policy: Product is soft-deletable, so the scoped
      // read also excludes rows with a `deletedAt` stamp.
      expect(findFirstSpy).toHaveBeenCalledWith({
        where: { id: 'prod-1', tenantId, deletedAt: null },
      });
    });
  });

  it('2. missing tenant context throws Fail-Safe exception immediately', async () => {
    // Act & Assert: Invoking findById outside dbTenantContext storage throws immediately
    await expect(
      repository.findById('prod-1')
    ).rejects.toThrow(/Fail-Safe Block: Access denied due to missing or unresolved tenant context/);
  });

  it('3. cross-tenant access is impossible during inserts', async () => {
    const tenantId = 'tenant-uuid-1111';

    await dbTenantContext.run({ tenantId }, async () => {
      // Act & Assert: Injecting a forged tenantId ('tenant-uuid-2222') throws fail-safe
      await expect(
        repository.create({ name: 'Forged Product', tenantId: 'tenant-uuid-2222' })
      ).rejects.toThrow(/Fail-Safe Block: Cross-tenant data insertion attempt detected and blocked/);
    });
  });

  it('4. repository methods produce identical behavior to previous findFirst filters', async () => {
    const tenantId = 'tenant-uuid-1111';
    const findFirstSpy = jest.spyOn(prisma.product, 'findFirst')
      .mockResolvedValue({ id: 'prod-1', tenantId } as any);

    await dbTenantContext.run({ tenantId }, async () => {
      // Act
      await repository.findById('prod-1');

      // Assert: findFirst({ where: { id, tenantId, deletedAt: null } })
      // DOC-002 §Soft Delete Policy: Product is soft-deletable, so the scoped
      // read also excludes rows with a `deletedAt` stamp.
      expect(findFirstSpy).toHaveBeenCalledWith({
        where: { id: 'prod-1', tenantId, deletedAt: null },
      });
    });
  });

  // ==========================================
  // DOC-002 §"Soft Delete Policy" — production readiness audit
  // ==========================================
  describe('soft-delete policy', () => {
    const softTenant = 'tenant-soft-1';

    it('excludes soft-deleted rows from findMany on a soft-deletable model', async () => {
      const spy = jest.spyOn(prisma.product, 'findMany').mockResolvedValue([] as never);
      const repo = new TenantProductRepository();

      await dbTenantContext.run({ tenantId: softTenant }, async () => {
        await repo.findMany({ categoryId: 'cat-1' });
      });

      expect(spy).toHaveBeenCalledWith({
        where: { categoryId: 'cat-1', tenantId: softTenant, deletedAt: null },
        take: 500,
      });
    });

    it('excludes soft-deleted rows from count on a soft-deletable model', async () => {
      const spy = jest.spyOn(prisma.product, 'count').mockResolvedValue(0 as never);
      const repo = new TenantProductRepository();

      await dbTenantContext.run({ tenantId: softTenant }, async () => {
        await repo.count();
      });

      expect(spy).toHaveBeenCalledWith({ where: { tenantId: softTenant, deletedAt: null } });
    });

    it('does NOT add deletedAt for models without the column (Order)', async () => {
      // Order has no `deletedAt`; filtering on it would raise
      // `Unknown argument 'deletedAt'` at runtime.
      const spy = jest.spyOn(prisma.order, 'findMany').mockResolvedValue([] as never);
      const repo = new TenantOrderRepository();

      await dbTenantContext.run({ tenantId: softTenant }, async () => {
        await repo.findMany({ status: 'PENDING' });
      });

      expect(spy).toHaveBeenCalledWith({
        where: { status: 'PENDING', tenantId: softTenant },
        take: 500,
      });
    });

    it('lets an explicit deletedAt filter win (archive/restore views)', async () => {
      const spy = jest.spyOn(prisma.product, 'findMany').mockResolvedValue([] as never);
      const repo = new TenantProductRepository();

      await dbTenantContext.run({ tenantId: softTenant }, async () => {
        await repo.findMany({ deletedAt: { not: null } });
      });

      expect(spy).toHaveBeenCalledWith({
        where: { deletedAt: { not: null }, tenantId: softTenant },
        take: 500,
      });
    });
  });

  // ==========================================
  // Production-readiness audit — unbounded list protection
  // ==========================================
  describe('list row cap', () => {
    it('applies a default row cap so no endpoint returns an unbounded set', async () => {
      const spy = jest.spyOn(prisma.order, 'findMany').mockResolvedValue([] as never);
      const repo = new TenantOrderRepository();

      await dbTenantContext.run({ tenantId: 'cap-tenant' }, async () => {
        await repo.findMany();
      });

      expect((spy.mock.calls[0][0] as Record<string, unknown>).take).toBe(500);
    });

    it('honours an explicit page window supplied by the caller', async () => {
      const spy = jest.spyOn(prisma.order, 'findMany').mockResolvedValue([] as never);
      const repo = new TenantOrderRepository();

      await dbTenantContext.run({ tenantId: 'cap-tenant' }, async () => {
        await repo.findMany({}, { take: 25, skip: 50 });
      });

      const args = spy.mock.calls[0][0] as Record<string, unknown>;
      expect(args.take).toBe(25);
      expect(args.skip).toBe(50);
    });
  });
});
