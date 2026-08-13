import { dbTenantContext, prisma } from '@zayjar/db';
import { DesignData, DesignService } from './design.service';

jest.mock('@zayjar/db', () => {
  const client: any = {
    tenantDesign: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    tenantDesignVersion: {
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    platformDesign: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };
  client.$transaction = jest.fn(async (callback: (tx: unknown) => unknown) => callback(client));
  return {
    prisma: client,
    dbTenantContext: {
      run: jest.fn((_store: unknown, callback: () => unknown) => callback()),
    },
  };
});

const TENANT_A = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';
const PRIVATE_DRAFT: DesignData = { colors: { primary: '#111111' }, sections: [] };
const TENANT_PUBLISHED: DesignData = { colors: { primary: '#222222' }, sections: [] };
const PLATFORM_DRAFT: DesignData = { colors: { primary: '#333333' }, sections: [] };
const PLATFORM_PUBLISHED: DesignData = { colors: { primary: '#444444' }, sections: [] };

type TenantRow = { tenantId: string; draft: DesignData; published: DesignData; version: number; publishedAt?: Date | null; updatedAt?: Date };
type VersionRow = { id: string; tenantId: string; version: number; data: DesignData; createdAt: Date };

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Transactional in-memory PostgreSQL stand-in used to exercise the complete mutation flow. */
function installTenantMemory(initial?: { row?: TenantRow; versions?: VersionRow[] }) {
  const state: { row: TenantRow | null; versions: VersionRow[] } = {
    row: initial?.row ? clone(initial.row) : null,
    versions: clone(initial?.versions ?? []),
  };
  let transactionTail: Promise<unknown> = Promise.resolve();
  let failNextVersionCreate = false;

  const makeTransactionClient = (working: typeof state) => ({
    $queryRaw: jest.fn().mockResolvedValue([]),
    tenantDesign: {
      findUnique: jest.fn(async ({ where }: any) => working.row?.tenantId === where.tenantId ? clone(working.row) : null),
      create: jest.fn(async ({ data }: any) => {
        if (working.row) { throw new Error('tenant design unique constraint'); }
        working.row = { ...clone(data), version: 1, publishedAt: null };
        return clone(working.row);
      }),
      update: jest.fn(async ({ where, data }: any) => {
        if (!working.row || working.row.tenantId !== where.tenantId) { throw new Error('design not found'); }
        working.row = { ...working.row, ...clone(data) };
        return clone(working.row);
      }),
    },
    tenantDesignVersion: {
      findFirst: jest.fn(async ({ where }: any) => {
        const rows = working.versions.filter((entry) =>
          entry.tenantId === where.tenantId && (where.version === undefined || entry.version === where.version),
        );
        return rows.sort((a, b) => b.version - a.version)[0] ? clone(rows.sort((a, b) => b.version - a.version)[0]) : null;
      }),
      create: jest.fn(async ({ data }: any) => {
        if (failNextVersionCreate) {
          failNextVersionCreate = false;
          throw new Error('version write failed');
        }
        if (working.versions.some((entry) => entry.tenantId === data.tenantId && entry.version === data.version)) {
          throw new Error('tenant/version unique constraint');
        }
        const entry: VersionRow = {
          id: `version-${data.version}`,
          ...clone(data),
          createdAt: new Date(2026, 0, 1, 0, 0, data.version),
        };
        working.versions.push(entry);
        return clone(entry);
      }),
      count: jest.fn(async ({ where }: any) => working.versions.filter((entry) => entry.tenantId === where.tenantId).length),
      findMany: jest.fn(async ({ where, orderBy, take }: any) => working.versions
        .filter((entry) => entry.tenantId === where.tenantId)
        .sort((a, b) => orderBy.version === 'asc' ? a.version - b.version : b.version - a.version)
        .slice(0, take)
        .map(clone)),
      delete: jest.fn(async ({ where }: any) => {
        const index = working.versions.findIndex((entry) => entry.id === where.id);
        if (index < 0) { throw new Error('version not found'); }
        return clone(working.versions.splice(index, 1)[0]);
      }),
    },
  });

  (prisma as any).$transaction.mockImplementation((callback: (tx: unknown) => Promise<unknown>) => {
    const run = transactionTail.then(async () => {
      const working = clone(state);
      const result = await callback(makeTransactionClient(working));
      state.row = working.row;
      state.versions = working.versions;
      return result;
    });
    transactionTail = run.then(() => undefined, () => undefined);
    return run;
  });
  (prisma as any).tenantDesign.findUnique.mockImplementation(async ({ where }: any) =>
    state.row?.tenantId === where.tenantId ? clone(state.row) : null,
  );
  (prisma as any).tenantDesignVersion.findMany.mockImplementation(async ({ where, take }: any) =>
    state.versions
      .filter((entry) => entry.tenantId === where.tenantId)
      .sort((a, b) => b.version - a.version)
      .slice(0, take)
      .map(clone),
  );

  return {
    snapshot: () => clone(state),
    failNextVersion: () => { failNextVersionCreate = true; },
  };
}

describe('DesignService A1/A2 — public projections and version integrity', () => {
  let service: DesignService;
  const tenantDesign = (prisma as unknown as { tenantDesign: Record<string, jest.Mock> }).tenantDesign;
  const tenantDesignVersion = (
    prisma as unknown as { tenantDesignVersion: Record<string, jest.Mock> }
  ).tenantDesignVersion;
  const platformDesign = (prisma as unknown as { platformDesign: Record<string, jest.Mock> }).platformDesign;
  const contextRun = dbTenantContext.run as jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new DesignService();
    contextRun.mockImplementation((_store: unknown, callback: () => unknown) => callback());
    (prisma as any).$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prisma));
    (prisma as any).$queryRaw.mockResolvedValue([]);
    tenantDesignVersion.count.mockResolvedValue(0);
    tenantDesignVersion.findFirst.mockResolvedValue(null);
    tenantDesignVersion.create.mockResolvedValue({});
    tenantDesignVersion.delete.mockResolvedValue({});
  });

  it('returns only the published tenant projection and never loads draft', async () => {
    tenantDesign.findUnique.mockResolvedValue({
      draft: PRIVATE_DRAFT,
      published: TENANT_PUBLISHED,
    });

    await expect(service.getPublishedDesign(TENANT_A)).resolves.toEqual(TENANT_PUBLISHED);
    expect(tenantDesign.findUnique).toHaveBeenCalledWith({
      where: { tenantId: TENANT_A },
      select: { published: true },
    });
    expect(contextRun).toHaveBeenCalledWith(
      { tenantId: TENANT_A },
      expect.any(Function),
    );
  });

  it('returns null for a tenant with no published design row without creating one', async () => {
    tenantDesign.findUnique.mockResolvedValue(null);

    await expect(service.getPublishedDesign(TENANT_A)).resolves.toBeNull();
    expect(tenantDesign.create).not.toHaveBeenCalled();
  });

  it('returns private builder defaults without creating or publishing on the first read', async () => {
    tenantDesign.findUnique.mockResolvedValue(null);

    const result = await service.getDesign(TENANT_A, true);

    expect(result).toMatchObject({ published: {}, version: 0, publishedAt: null });
    expect((result as any).preview).toEqual(result.draft);
    expect(tenantDesign.create).not.toHaveBeenCalled();
  });

  it('does not publish a first private tenant draft implicitly', async () => {
    tenantDesign.findUnique.mockResolvedValue(null);
    tenantDesign.create.mockResolvedValue({ version: 1, draft: PRIVATE_DRAFT, published: {} });

    await service.saveDraft(TENANT_A, PRIVATE_DRAFT);

    expect(tenantDesign.create).toHaveBeenCalledWith({
      data: { tenantId: TENANT_A, draft: PRIVATE_DRAFT, published: {}, version: 1 },
    });
  });

  it('returns only published platform data to public callers', async () => {
    platformDesign.findFirst.mockResolvedValue({
      draft: PLATFORM_DRAFT,
      published: PLATFORM_PUBLISHED,
    });

    await expect(service.getPublishedPlatformDesign()).resolves.toEqual(PLATFORM_PUBLISHED);
    expect(platformDesign.findFirst).toHaveBeenCalledWith({ select: { published: true } });
    expect(contextRun).toHaveBeenCalledWith(
      { isPlatformOwner: true },
      expect.any(Function),
    );
  });

  it('keeps platform draft access on the separate protected service path', async () => {
    platformDesign.findFirst.mockResolvedValue({ draft: PLATFORM_DRAFT });

    await expect(service.getPlatformPreview()).resolves.toEqual(PLATFORM_DRAFT);
    expect(platformDesign.findFirst).toHaveBeenCalledWith({ select: { draft: true } });
  });

  it('does not publish a first private platform draft implicitly', async () => {
    platformDesign.findFirst.mockResolvedValue(null);
    platformDesign.create.mockResolvedValue({ draft: PLATFORM_DRAFT, published: {} });

    await service.savePlatformDraft(PLATFORM_DRAFT);

    expect(platformDesign.create).toHaveBeenCalledWith({
      data: { draft: PLATFORM_DRAFT, published: {}, version: 1 },
    });
  });

  it('serializes platform draft and publish mutations without exposing the first draft', async () => {
    let row: any = null;
    let tail: Promise<unknown> = Promise.resolve();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      platformDesign: {
        findFirst: jest.fn(async () => row ? clone(row) : null),
        create: jest.fn(async ({ data }: any) => {
          row = { id: 'platform-design', ...clone(data) };
          return clone(row);
        }),
        update: jest.fn(async ({ data }: any) => {
          row = { ...row, ...clone(data) };
          return clone(row);
        }),
      },
    };
    (prisma as any).$transaction.mockImplementation((callback: (client: unknown) => Promise<unknown>) => {
      const run = tail.then(() => callback(tx));
      tail = run.then(() => undefined, () => undefined);
      return run;
    });

    await Promise.all([
      service.savePlatformDraft(PLATFORM_DRAFT),
      service.savePlatformDraft(PRIVATE_DRAFT),
    ]);
    expect(row).toMatchObject({ version: 2, published: {} });

    await service.publishPlatform();
    expect(row).toMatchObject({ version: 3, published: row.draft });
  });

  it('allocates unique monotonic versions across repeated autosaves', async () => {
    const memory = installTenantMemory();
    const drafts = [
      { colors: { primary: '#100000' }, sections: [] },
      { colors: { primary: '#200000' }, sections: [] },
      { colors: { primary: '#300000' }, sections: [] },
    ];

    for (const draft of drafts) { await service.saveDraft(TENANT_A, draft); }

    const snapshot = memory.snapshot();
    expect(snapshot.row).toMatchObject({ version: 3, draft: drafts[2], published: {} });
    expect(snapshot.versions.map((entry) => entry.version)).toEqual([1, 2, 3]);
    expect(new Set(snapshot.versions.map((entry) => `${entry.tenantId}:${entry.version}`)).size).toBe(3);
    await expect(service.getPublishedDesign(TENANT_A)).resolves.toEqual({});
  });

  it('serializes concurrent first saves and allocates each a distinct version', async () => {
    const memory = installTenantMemory();
    const first = { colors: { primary: '#aaaaaa' }, sections: [] };
    const second = { colors: { primary: '#bbbbbb' }, sections: [] };

    await Promise.all([
      service.saveDraft(TENANT_A, first),
      service.saveDraft(TENANT_A, second),
    ]);

    const snapshot = memory.snapshot();
    expect(snapshot.versions.map((entry) => entry.version)).toEqual([1, 2]);
    expect(snapshot.row?.version).toBe(2);
    expect([first, second]).toContainEqual(snapshot.row?.draft);
  });

  it('allocates from the maximum row/history version when row metadata is stale', async () => {
    const memory = installTenantMemory({
      row: { tenantId: TENANT_A, draft: PRIVATE_DRAFT, published: {}, version: 2 },
      versions: [{ id: 'version-7', tenantId: TENANT_A, version: 7, data: PRIVATE_DRAFT, createdAt: new Date() }],
    });

    await service.saveDraft(TENANT_A, TENANT_PUBLISHED);

    expect(memory.snapshot().row?.version).toBe(8);
    expect(memory.snapshot().versions.map((entry) => entry.version)).toEqual([7, 8]);
  });

  it('publishes and restores after multiple versions without reusing a version or changing published on restore', async () => {
    const memory = installTenantMemory();
    const first = { colors: { primary: '#010101' }, sections: [] };
    const second = { colors: { primary: '#020202' }, sections: [] };
    const third = { colors: { primary: '#030303' }, sections: [] };

    await service.saveDraft(TENANT_A, first);       // v1
    await service.saveDraft(TENANT_A, second);      // v2
    await service.publish(TENANT_A);                // v3
    await service.saveDraft(TENANT_A, third);       // v4
    await service.restore(TENANT_A, 1);             // v5

    const snapshot = memory.snapshot();
    expect(snapshot.versions.map((entry) => entry.version)).toEqual([1, 2, 3, 4, 5]);
    expect(snapshot.row).toMatchObject({ version: 5, draft: first, published: second });
    await expect(service.getPublishedDesign(TENANT_A)).resolves.toEqual(second);
  });

  it('rolls back the draft mutation when its version write fails', async () => {
    const original: TenantRow = {
      tenantId: TENANT_A,
      draft: PRIVATE_DRAFT,
      published: TENANT_PUBLISHED,
      version: 1,
    };
    const memory = installTenantMemory({
      row: original,
      versions: [{ id: 'version-1', tenantId: TENANT_A, version: 1, data: PRIVATE_DRAFT, createdAt: new Date() }],
    });
    const before = memory.snapshot();
    memory.failNextVersion();

    await expect(service.saveDraft(TENANT_A, PLATFORM_DRAFT)).rejects.toThrow('version write failed');

    expect(memory.snapshot()).toEqual(before);
  });

  it('retains the newest 50 revisions and exposes only the newest 20 in descending order', async () => {
    const versions: VersionRow[] = Array.from({ length: 50 }, (_, index) => ({
      id: `version-${index + 1}`,
      tenantId: TENANT_A,
      version: index + 1,
      data: { colors: { primary: `#${String(index + 1).padStart(6, '0')}` }, sections: [] },
      createdAt: new Date(2026, 0, 1, 0, 0, index + 1),
    }));
    const memory = installTenantMemory({
      row: { tenantId: TENANT_A, draft: versions[49].data, published: TENANT_PUBLISHED, version: 50 },
      versions,
    });

    await service.saveDraft(TENANT_A, PLATFORM_DRAFT);
    const visible = await service.getVersions(TENANT_A);
    const stored = memory.snapshot().versions.map((entry) => entry.version).sort((a, b) => a - b);

    expect(stored).toHaveLength(50);
    expect(stored).toEqual(Array.from({ length: 50 }, (_, index) => index + 2));
    expect(visible).toHaveLength(20);
    expect(visible.map((entry) => entry.version)).toEqual(Array.from({ length: 20 }, (_, index) => 51 - index));
  });
});
