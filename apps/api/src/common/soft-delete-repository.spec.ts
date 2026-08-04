import 'reflect-metadata';
import { BaseTenantRepository, dbTenantContext } from '@zayjar/db';

/**
 * AUDIT-006/007 — `BaseTenantRepository` soft-delete primitives.
 *
 * These exercise the real `BaseTenantRepository` (not a mock) against a fake
 * Prisma delegate, so the tenant predicate, the `deletedAt IS NULL` filter and
 * the idempotency rules are asserted on the shipped implementation.
 */

interface Row {
  id: string;
  tenantId: string;
  deletedAt: Date | null;
  isAvailable?: boolean;
}

const TENANT = 'tenant-a';
const OTHER_TENANT = 'tenant-b';

function makeDelegate(rows: Row[]): {
  delegate: Record<string, unknown>;
  seen: { findFirst: Record<string, unknown>[]; update: Record<string, unknown>[] };
} {
  const seen = { findFirst: [] as Record<string, unknown>[], update: [] as Record<string, unknown>[] };

  const matches = (row: Row, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([k, v]) => {
      // Prisma treats `undefined` as "no constraint".
      if (v === undefined) {
        return true;
      }
      if (k === 'deletedAt') {
        return v === null ? row.deletedAt === null : row.deletedAt !== null;
      }
      return (row as unknown as Record<string, unknown>)[k] === v;
    });

  const delegate = {
    findFirst: async (args: { where: Record<string, unknown> }) => {
      seen.findFirst.push(args.where);
      return rows.find((r) => matches(r, args.where)) ?? null;
    },
    update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      seen.update.push(args as unknown as Record<string, unknown>);
      const row = rows.find((r) => r.id === args.where.id) as Row;
      Object.assign(row, args.data);
      return row;
    },
    findMany: async () => rows,
    create: async () => rows[0],
    delete: async () => rows[0],
    count: async () => rows.length,
  };

  return { delegate, seen };
}

class TestRepo extends BaseTenantRepository<Row> {
  protected readonly softDeletable = true;
  constructor(delegate: unknown) {
    super(delegate);
  }
}

function withTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return dbTenantContext.run({ tenantId }, fn);
}

describe('BaseTenantRepository — soft-delete primitives (AUDIT-006/007)', () => {
  it('findById hides soft-deleted rows', async () => {
    const rows: Row[] = [{ id: 'r1', tenantId: TENANT, deletedAt: new Date() }];
    const { delegate } = makeDelegate(rows);
    const repo = new TestRepo(delegate);

    await withTenant(TENANT, async () => {
      expect(await repo.findById('r1')).toBeNull();
    });
  });

  it('findByIdIncludingDeleted returns soft-deleted rows', async () => {
    const rows: Row[] = [{ id: 'r1', tenantId: TENANT, deletedAt: new Date() }];
    const { delegate, seen } = makeDelegate(rows);
    const repo = new TestRepo(delegate);

    await withTenant(TENANT, async () => {
      const row = await repo.findByIdIncludingDeleted('r1');
      expect(row).not.toBeNull();
      // Tenant scoping must still be present on the widened lookup.
      expect(seen.findFirst[0]).toMatchObject({ id: 'r1', tenantId: TENANT });
    });
  });

  it('findByIdIncludingDeleted still refuses cross-tenant rows', async () => {
    const rows: Row[] = [{ id: 'r1', tenantId: OTHER_TENANT, deletedAt: new Date() }];
    const { delegate } = makeDelegate(rows);
    const repo = new TestRepo(delegate);

    await withTenant(TENANT, async () => {
      expect(await repo.findByIdIncludingDeleted('r1')).toBeNull();
    });
  });

  it('softDelete stamps deletedAt and merges extra fields', async () => {
    const rows: Row[] = [{ id: 'r1', tenantId: TENANT, deletedAt: null, isAvailable: true }];
    const { delegate, seen } = makeDelegate(rows);
    const repo = new TestRepo(delegate);

    await withTenant(TENANT, async () => {
      await repo.softDelete('r1', { isAvailable: false });
    });

    expect(rows[0].deletedAt).toBeInstanceOf(Date);
    expect(rows[0].isAvailable).toBe(false);
    expect(seen.update).toHaveLength(1);
  });

  it('softDelete is idempotent — a second call does not move the tombstone', async () => {
    const original = new Date('2020-01-01T00:00:00.000Z');
    const rows: Row[] = [{ id: 'r1', tenantId: TENANT, deletedAt: original }];
    const { delegate, seen } = makeDelegate(rows);
    const repo = new TestRepo(delegate);

    await withTenant(TENANT, async () => {
      await repo.softDelete('r1');
    });

    expect(rows[0].deletedAt).toBe(original);
    expect(seen.update).toHaveLength(0);
  });

  it('softDelete throws for an unknown id', async () => {
    const { delegate } = makeDelegate([]);
    const repo = new TestRepo(delegate);
    await withTenant(TENANT, async () => {
      await expect(repo.softDelete('nope')).rejects.toThrow(/Fail-Safe Block/);
    });
  });

  it('restore clears the tombstone', async () => {
    const rows: Row[] = [{ id: 'r1', tenantId: TENANT, deletedAt: new Date(), isAvailable: false }];
    const { delegate } = makeDelegate(rows);
    const repo = new TestRepo(delegate);

    await withTenant(TENANT, async () => {
      await repo.restore('r1', { isAvailable: true });
    });

    expect(rows[0].deletedAt).toBeNull();
    expect(rows[0].isAvailable).toBe(true);
  });

  it('restore is idempotent for a live row', async () => {
    const rows: Row[] = [{ id: 'r1', tenantId: TENANT, deletedAt: null }];
    const { delegate, seen } = makeDelegate(rows);
    const repo = new TestRepo(delegate);

    await withTenant(TENANT, async () => {
      await repo.restore('r1');
    });

    expect(seen.update).toHaveLength(0);
  });

  it('refuses to operate with no tenant context at all', async () => {
    const { delegate } = makeDelegate([{ id: 'r1', tenantId: TENANT, deletedAt: null }]);
    const repo = new TestRepo(delegate);
    await expect(repo.softDelete('r1')).rejects.toThrow(/Fail-Safe Block/);
    await expect(repo.restore('r1')).rejects.toThrow(/Fail-Safe Block/);
  });
});
