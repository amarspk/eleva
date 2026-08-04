import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { BranchService } from './branch.service';
import { UpdateBranchRequestDto } from './dto/update-branch-request.dto';
import { UpdateTableRequestDto } from './dto/update-table-request.dto';

/**
 * AUDIT-007 regression suite — update / soft-delete / restore for branches and
 * tables.
 *
 * Defects locked down (all reproduced at runtime before the fix):
 *  - DEFECT-A/B: no PUT or DELETE route existed for branches or tables.
 *  - DEFECT-D: the QR unique index was total rather than partial, so
 *    soft-deleting a table permanently burned its number. The restore path now
 *    also has to cope with the number having been recreated.
 *  - DEFECT-F: `updateMany` is blocked by the tenant-scoped Prisma extension.
 */

const txState: {
  tablesFound: { id: string }[];
  tableUpdates: { where: Record<string, unknown>; data: Record<string, unknown> }[];
  branchUpdates: { where: Record<string, unknown>; data: Record<string, unknown> }[];
  updateManyCalls: number;
} = { tablesFound: [], tableUpdates: [], branchUpdates: [], updateManyCalls: 0 };

const repoState: {
  branch: Record<string, unknown> | null;
  branchIncludingDeleted: Record<string, unknown> | null;
  table: Record<string, unknown> | null;
  tableIncludingDeleted: Record<string, unknown> | null;
  qrConflict: Record<string, unknown> | null;
  restaurant: Record<string, unknown> | null;
} = {
  branch: null,
  branchIncludingDeleted: null,
  table: null,
  tableIncludingDeleted: null,
  qrConflict: null,
  restaurant: null,
};

const calls: { softDelete: unknown[][]; restore: unknown[][]; update: unknown[][] } = {
  softDelete: [],
  restore: [],
  update: [],
};

let activeOrderCount = 0;
let lastOrderCountWhere: Record<string, unknown> | null = null;

jest.mock('@zayjar/db', () => {
  class TenantBranchRepository {
    async findById(): Promise<unknown> {
      return repoState.branch;
    }
    async findByIdIncludingDeleted(): Promise<unknown> {
      return repoState.branchIncludingDeleted;
    }
    async update(...args: unknown[]): Promise<unknown> {
      calls.update.push(['branch', ...args]);
      return { ...(repoState.branch as object), ...(args[1] as object) };
    }
    async softDelete(...args: unknown[]): Promise<unknown> {
      calls.softDelete.push(['branch', ...args]);
      return repoState.branch;
    }
    async restore(...args: unknown[]): Promise<unknown> {
      calls.restore.push(['branch', ...args]);
      return repoState.branchIncludingDeleted;
    }
  }
  class TenantTableRepository {
    async findById(): Promise<unknown> {
      return repoState.table;
    }
    async findByIdIncludingDeleted(): Promise<unknown> {
      return repoState.tableIncludingDeleted;
    }
    async findByQrCodeToken(): Promise<unknown> {
      return repoState.qrConflict;
    }
    async update(...args: unknown[]): Promise<unknown> {
      calls.update.push(['table', ...args]);
      return { ...(repoState.table as object), ...(args[1] as object) };
    }
    async softDelete(...args: unknown[]): Promise<unknown> {
      calls.softDelete.push(['table', ...args]);
      return repoState.table;
    }
    async restore(...args: unknown[]): Promise<unknown> {
      calls.restore.push(['table', ...args]);
      return repoState.tableIncludingDeleted;
    }
  }

  // AUDIT-014 DEFECT-N: createBranch now validates the parent brand, so the
  // service constructs a TenantRestaurantRepository at instantiation.
  class TenantRestaurantRepository {
    async findById(): Promise<unknown> {
      return repoState.restaurant;
    }
  }

  const tx = {
    table: {
      findMany: jest.fn(async () => {
        const batch = txState.tablesFound;
        txState.tablesFound = [];
        return batch;
      }),
      update: jest.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        txState.tableUpdates.push(args);
        return args;
      }),
      updateMany: jest.fn(async () => {
        txState.updateManyCalls += 1;
        throw new Error("Fail-Safe Block: Operation 'updateMany' is unsupported on scoped model 'Table'.");
      }),
    },
    branch: {
      update: jest.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        txState.branchUpdates.push(args);
        return args;
      }),
      updateMany: jest.fn(async () => {
        txState.updateManyCalls += 1;
        throw new Error("Fail-Safe Block: Operation 'updateMany' is unsupported on scoped model 'Branch'.");
      }),
    },
  };

  return {
    TenantBranchRepository,
    TenantRestaurantRepository,
    TenantTableRepository,
    prisma: {
      $transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
      order: {
        count: jest.fn(async (args: { where: Record<string, unknown> }) => {
          lastOrderCountWhere = args.where;
          return activeOrderCount;
        }),
      },
    },
  };
});

const BRANCH_ID = '4316ed8e-e1df-43bb-82ab-abbc2140ab8b';
const TABLE_ID = '187b75b3-155a-438e-8ded-34ce95b984dc';
const TENANT_ID = '80a00898-782c-4a6e-8bad-880e8f4f7977';

describe('BranchService — AUDIT-007 CRUD', () => {
  let service: BranchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BranchService],
    }).compile();
    service = module.get<BranchService>(BranchService);

    repoState.branch = { id: BRANCH_ID, tenantId: TENANT_ID, name: 'Main', deletedAt: null };
    repoState.branchIncludingDeleted = repoState.branch;
    repoState.table = {
      id: TABLE_ID,
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      number: '12',
      qrCodeToken: 'tok-12',
      deletedAt: null,
    };
    repoState.tableIncludingDeleted = repoState.table;
    repoState.qrConflict = null;
    repoState.restaurant = { id: 'rest-1', tenantId: TENANT_ID, name: 'Al-Baik' };

    txState.tablesFound = [];
    txState.tableUpdates = [];
    txState.branchUpdates = [];
    txState.updateManyCalls = 0;
    calls.softDelete = [];
    calls.restore = [];
    calls.update = [];
    activeOrderCount = 0;
    lastOrderCountWhere = null;
  });

  // ---------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------
  describe('updateBranch', () => {
    it('applies only supplied fields', async () => {
      await service.updateBranch(BRANCH_ID, { name: 'Downtown' });
      const [, , data] = calls.update[0] as [string, string, Record<string, unknown>];
      expect(data).toEqual({ name: 'Downtown' });
    });

    it('is a no-op for an empty body', async () => {
      const result = await service.updateBranch(BRANCH_ID, {});
      expect(calls.update).toHaveLength(0);
      expect(result).toBe(repoState.branch);
    });

    it('404s for an unknown / foreign branch', async () => {
      repoState.branch = null;
      await expect(service.updateBranch(BRANCH_ID, { name: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('updateTable', () => {
    it('updates seating capacity and status', async () => {
      await service.updateTable(TABLE_ID, { seatingCapacity: 8, status: 'DIRTY' });
      const [, , data] = calls.update[0] as [string, string, Record<string, unknown>];
      expect(data).toEqual({ seatingCapacity: 8, status: 'DIRTY' });
    });

    it('404s for an unknown / foreign table', async () => {
      repoState.table = null;
      await expect(service.updateTable(TABLE_ID, { seatingCapacity: 2 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------
  // Soft delete
  // ---------------------------------------------------------------
  describe('deleteBranch', () => {
    it('cascades to tables WITHOUT updateMany and deactivates the branch', async () => {
      txState.tablesFound = [{ id: 't1' }, { id: 't2' }];
      const result = await service.deleteBranch(BRANCH_ID);

      expect(result).toEqual({ id: BRANCH_ID, deleted: true });
      expect(txState.updateManyCalls).toBe(0);
      expect(txState.tableUpdates.map((u) => u.where)).toEqual([{ id: 't1' }, { id: 't2' }]);
      expect(txState.branchUpdates[0].data).toMatchObject({ isActive: false });
      expect(txState.branchUpdates[0].data.deletedAt).toBeInstanceOf(Date);
    });

    it('refuses (409) while orders are in progress', async () => {
      activeOrderCount = 3;
      await expect(service.deleteBranch(BRANCH_ID)).rejects.toBeInstanceOf(ConflictException);
      expect(txState.branchUpdates).toHaveLength(0);
    });

    it('scopes the active-order probe by tenant and open statuses', async () => {
      await service.deleteBranch(BRANCH_ID);
      expect(lastOrderCountWhere).toMatchObject({ branchId: BRANCH_ID, tenantId: TENANT_ID });
      expect((lastOrderCountWhere as { status: { in: string[] } }).status.in).toEqual(
        expect.arrayContaining(['DRAFT', 'PENDING', 'ACCEPTED', 'PREPARING', 'READY']),
      );
    });

    it('does not treat COMPLETED / CANCELLED as blocking', () => {
      const statuses = (lastOrderCountWhere ?? { status: { in: [] } }) as { status?: { in: string[] } };
      void statuses;
      // Asserted via the status list above; COMPLETED/CANCELLED must be absent.
      return service.deleteBranch(BRANCH_ID).then(() => {
        expect((lastOrderCountWhere as { status: { in: string[] } }).status.in).not.toEqual(
          expect.arrayContaining(['COMPLETED']),
        );
      });
    });

    it('404s for an unknown / foreign branch', async () => {
      repoState.branch = null;
      await expect(service.deleteBranch(BRANCH_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteTable', () => {
    it('soft-deletes the table', async () => {
      const result = await service.deleteTable(TABLE_ID);
      expect(result).toEqual({ id: TABLE_ID, deleted: true });
      expect(calls.softDelete[0][0]).toBe('table');
    });

    it('refuses (409) while the table has open orders', async () => {
      activeOrderCount = 1;
      await expect(service.deleteTable(TABLE_ID)).rejects.toBeInstanceOf(ConflictException);
      expect(calls.softDelete).toHaveLength(0);
    });

    it('404s for an unknown / foreign table', async () => {
      repoState.table = null;
      await expect(service.deleteTable(TABLE_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---------------------------------------------------------------
  // Restore
  // ---------------------------------------------------------------
  describe('restoreBranch', () => {
    it('restores and reactivates', async () => {
      repoState.branchIncludingDeleted = { ...(repoState.branch as object), deletedAt: new Date() };
      const result = await service.restoreBranch(BRANCH_ID);
      expect(result).toEqual({ id: BRANCH_ID, restored: true });
      expect(calls.restore[0]).toEqual(['branch', BRANCH_ID, { isActive: true }]);
    });

    it('does NOT cascade-restore tables', async () => {
      repoState.branchIncludingDeleted = { ...(repoState.branch as object), deletedAt: new Date() };
      await service.restoreBranch(BRANCH_ID);
      expect(txState.tableUpdates).toHaveLength(0);
    });

    it('404s when nothing matches even including deleted rows', async () => {
      repoState.branchIncludingDeleted = null;
      await expect(service.restoreBranch(BRANCH_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('restoreTable', () => {
    beforeEach(() => {
      repoState.tableIncludingDeleted = { ...(repoState.table as object), deletedAt: new Date() };
    });

    it('restores when the branch is live and the QR token is free', async () => {
      const result = await service.restoreTable(TABLE_ID);
      expect(result).toEqual({ id: TABLE_ID, restored: true });
      expect(calls.restore[0][0]).toBe('table');
    });

    it('refuses (409) when the parent branch is deleted', async () => {
      repoState.branch = null;
      await expect(service.restoreTable(TABLE_ID)).rejects.toBeInstanceOf(ConflictException);
      expect(calls.restore).toHaveLength(0);
    });

    it('refuses (409) when the table number was recreated (DEFECT-D)', async () => {
      // A live table already holds the deterministic HMAC token, so restoring
      // this row would violate the partial unique index as a raw 500.
      repoState.qrConflict = { id: 'some-other-table-id', qrCodeToken: 'tok-12' };
      await expect(service.restoreTable(TABLE_ID)).rejects.toBeInstanceOf(ConflictException);
      expect(calls.restore).toHaveLength(0);
    });

    it('still restores when the only QR match is the record itself', async () => {
      repoState.qrConflict = { id: TABLE_ID, qrCodeToken: 'tok-12' };
      await expect(service.restoreTable(TABLE_ID)).resolves.toEqual({
        id: TABLE_ID,
        restored: true,
      });
    });

    it('404s when nothing matches even including deleted rows', async () => {
      repoState.tableIncludingDeleted = null;
      await expect(service.restoreTable(TABLE_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

describe('AUDIT-007 update DTO validation', () => {
  it('rejects an out-of-range latitude', async () => {
    const errors = await validate(plainToInstance(UpdateBranchRequestDto, { latitude: 999999 }));
    expect(errors.some((e) => e.property === 'latitude')).toBe(true);
  });

  it('rejects an out-of-range longitude', async () => {
    const errors = await validate(plainToInstance(UpdateBranchRequestDto, { longitude: -1000 }));
    expect(errors.some((e) => e.property === 'longitude')).toBe(true);
  });

  it('rejects an unknown table status', async () => {
    const errors = await validate(plainToInstance(UpdateTableRequestDto, { status: 'EXPLODED' }));
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('accepts every valid table status', async () => {
    for (const status of ['VACANT', 'OCCUPIED', 'RESERVED', 'DIRTY']) {
      expect(await validate(plainToInstance(UpdateTableRequestDto, { status }))).toHaveLength(0);
    }
  });

  it('rejects a seating capacity above the column bound', async () => {
    const errors = await validate(plainToInstance(UpdateTableRequestDto, { seatingCapacity: 5000 }));
    expect(errors.some((e) => e.property === 'seatingCapacity')).toBe(true);
  });

  it('declares no branchId/number on the table update DTO (QR immutability)', async () => {
    // Both feed the deterministic QR HMAC; making them writable would silently
    // invalidate printed stickers. `forbidNonWhitelisted` turns them into 400s.
    expect(await validate(new UpdateTableRequestDto())).toHaveLength(0);
    const declared = Object.getOwnPropertyNames(new UpdateTableRequestDto());
    expect(declared).not.toContain('branchId');
    expect(declared).not.toContain('number');
  });

  it('declares no restaurantId on the branch update DTO', async () => {
    expect(await validate(new UpdateBranchRequestDto())).toHaveLength(0);
    expect(Object.getOwnPropertyNames(new UpdateBranchRequestDto())).not.toContain('restaurantId');
  });
});
