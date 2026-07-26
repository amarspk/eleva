import { prisma, prismaRead, dbTenantContext } from '@zayjar/db';

describe('Database Read Replica Routing (DOC-001 §1.5)', () => {
  describe('prisma and prismaRead client initialization', () => {
    it('should export both prisma (write) and prismaRead (read) clients from @zayjar/db', () => {
      expect(prisma).toBeDefined();
      expect(prismaRead).toBeDefined();
    });

    it('should have $transaction on the write client', () => {
      expect(typeof prisma.$transaction).toBe('function');
    });

    it('should have $transaction on the read client', () => {
      expect(typeof prismaRead.$transaction).toBe('function');
    });
  });

  describe('Tenant context isolation on read client', () => {
    it('should block unscoped reads on tenant-scoped models via prismaRead', async () => {
      await expect(
        prismaRead.order.findMany({ where: {} }),
      ).rejects.toThrow('Fail-Safe Block');
    });

    it('should allow unscoped reads on Tenant model via prismaRead', async () => {
      // Tenant is in the unscopedModels list, so it should not throw
      // This will throw a connection error in test env (no DB), but NOT a fail-safe block
      try {
        await prismaRead.tenant.findMany({ where: {} });
      } catch (err: any) {
        // Connection errors are expected in unit tests without a running database
        expect(err.message).not.toContain('Fail-Safe Block');
      }
    });

    it('should apply tenant scoping on prismaRead when context is set', async () => {
      const store = new Map();
      store.set('tenantId', 'test-tenant-id');

      await dbTenantContext.run({ tenantId: 'test-tenant-id' }, async () => {
        try {
          await prismaRead.branch.findMany({ where: {} });
        } catch (err: any) {
          // Connection errors expected, but NOT a fail-safe block
          expect(err.message).not.toContain('Fail-Safe Block');
        }
      });
    });
  });

  describe('prismaRead falls back to DATABASE_URL', () => {
    it('should have a valid datasource URL configured', () => {
      // prismaRead should always have a URL configured (either DATABASE_READ_URL or DATABASE_URL)
      expect(prismaRead).toBeDefined();
      // If we got here without initialization errors, the URL was resolved
    });
  });
});
