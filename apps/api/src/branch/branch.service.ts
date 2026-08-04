import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { CreateBranchRequestDto } from './dto/create-branch-request.dto';
import { CreateTableRequestDto } from './dto/create-table-request.dto';
import { UpdateBranchRequestDto } from './dto/update-branch-request.dto';
import { UpdateTableRequestDto } from './dto/update-table-request.dto';
import {
  TenantBranchRepository,
  TenantTableRepository,
  TenantRestaurantRepository,
  Branch,
  Table,
  prisma,
} from '@zayjar/db';
import * as crypto from 'crypto';

/** Uniform response for a soft-delete mutation. */
export interface SoftDeleteResult {
  id: string;
  deleted: boolean;
}

/** Uniform response for a restore mutation. */
export interface RestoreResult {
  id: string;
  restored: true;
}

/**
 * Order states that still need the table/branch to exist operationally.
 * A location with work in flight must not disappear from the floor plan
 * mid-service, so deletion is refused while any of these are open.
 */
const ACTIVE_ORDER_STATUSES = ['DRAFT', 'PENDING', 'ACCEPTED', 'PREPARING', 'READY'] as const;

/** Transaction envelope for the branch -> tables cascade. */
const TX_OPTIONS = { maxWait: 5000, timeout: 15000 };

/** Page size for the branch -> tables cascade. */
const CASCADE_BATCH_SIZE = 200;

/**
 * Non-production development fallback for the QR-signing pepper. Mirrors the
 * value previously inlined here so local/dev QR tokens stay reproducible.
 */
const DEV_PEPPER_FALLBACK = 'zayjar-default-pepper-999!';

/**
 * Resolves the HMAC pepper used to sign table QR tokens.
 *
 * Security (DOC-006 §5.9 secrets management): the previous implementation was
 * `process.env.SYSTEM_PEPPER || '<hardcoded>'`, which silently signed
 * production QR tokens with a value committed to this repository. Because the
 * signature payload is `tenantId:branchId:tableNumber` and BOTH ids are
 * returned by the public guest surface (`public-menu.service.ts` emits
 * `branch: { id }`), anyone reading the source could forge a valid token for
 * any table of any tenant and place guest orders against it.
 *
 * This now follows the platform's established fail-closed convention for
 * secrets (`jwt.config.ts:requireSecret`): refuse to start signing in
 * production rather than fall back to a public constant. `SYSTEM_PEPPER` is
 * already wired in `.env.example`, `docker-compose.yml`, `k8s/secrets.yml` and
 * both k8s deployments, so no deployment change is required.
 */
export function resolveSystemPepper(): string {
  const value = process.env.SYSTEM_PEPPER;
  if (value) {
    return value;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'FATAL: SYSTEM_PEPPER must be set in production. Refusing to sign QR tokens with a default pepper.',
    );
  }
  return DEV_PEPPER_FALLBACK;
}

@Injectable()
export class BranchService {
  private readonly logger = new Logger('BranchService');
  private readonly branchRepository = new TenantBranchRepository();
  private readonly tableRepository = new TenantTableRepository();
  /** Validates the parent brand on branch create (DEFECT-N). */
  private readonly restaurantRepository = new TenantRestaurantRepository();

  /**
   * Creates a physical branch location under a restaurant brand.
   */
  async createBranch(dto: CreateBranchRequestDto): Promise<Branch> {
    this.logger.log(`Creating branch location: [${dto.name}]`);

    // AUDIT-014 (DEFECT-N, same class as createCategory): `restaurantId` is a
    // plain FK, so a foreign or unknown id reached Postgres and surfaced as an
    // unhandled `Foreign key constraint violated` -> HTTP 500. The
    // tenant-scoped read returns null for both cases, giving a uniform 404.
    const restaurant = await this.restaurantRepository.findById(dto.restaurantId);
    if (!restaurant) {
      throw new NotFoundException(
        `The requested Restaurant with ID [${dto.restaurantId}] was not found.`,
      );
    }

    return this.branchRepository.create({
      restaurantId: dto.restaurantId,
      name: dto.name,
      address: dto.address,
      latitude: dto.latitude,
      longitude: dto.longitude,
      phoneNumber: dto.phoneNumber,
      operatingHours: dto.operatingHours,
      isActive: true,
    });
  }

  /**
   * Retrieves all branches scoping to the active tenant.
   *
   * AUDIT-014 (DEFECT-J): `includeDeleted` lets the Backoffice archive view
   * surface soft-deleted rows so they can be restored. Without it the restore
   * endpoints were unreachable — no list could ever return an archived id.
   */
  async getBranches(includeDeleted = false): Promise<Branch[]> {
    return this.branchRepository.findMany(includeDeleted ? { deletedAt: undefined } : {});
  }

  /**
   * Provisions a seating table and generates its secure cryptographic QR token.
   */
  async createTable(dto: CreateTableRequestDto): Promise<Table> {
    this.logger.log(`Provisioning seating table number: [${dto.number}]`);

    // 1. Fetch current tenantId from active repository thread
    const branch = await this.branchRepository.findById(dto.branchId);
    if (!branch) {
      // Unknown/foreign branch id is a client error: 404, not 500. The bare
      // Error produced HTTP 500 (runtime-verified) and leaked a stack trace
      // path into the response pipeline.
      throw new NotFoundException(`The requested Branch with ID [${dto.branchId}] was not found.`);
    }

    const tenantId = branch.tenantId;
    const pepper = resolveSystemPepper();

    // ==========================================
    // SECURE QR TOKEN ENCRYPTION PATH
    // ==========================================
    const signaturePayload = `${tenantId}:${dto.branchId}:${dto.number}`;
    const qrCodeToken = crypto
      .createHmac('sha256', pepper)
      .update(signaturePayload)
      .digest('hex');

    // Write to PostgreSQL via the repository
    return this.tableRepository.create({
      branchId: dto.branchId,
      number: dto.number,
      seatingCapacity: dto.seatingCapacity,
      qrCodeToken,
      status: 'VACANT',
    });
  }

  /**
   * Retrieves all seating tables scoped to the branch.
   *
   * See `getBranches` for why `includeDeleted` exists (AUDIT-014 DEFECT-J).
   */
  async getTables(branchId?: string, includeDeleted = false): Promise<Table[]> {
    const where: Record<string, unknown> = {};
    if (branchId) {
      where.branchId = branchId;
    }
    if (includeDeleted) {
      where.deletedAt = undefined;
    }
    return this.tableRepository.findMany(where);
  }

  // ==========================================
  // AUDIT-007 — Branch update / soft-delete / restore
  // ==========================================

  /**
   * Applies a partial update to a branch. `restaurantId` is not accepted by the
   * DTO, so a branch can never be re-parented to another restaurant.
   */
  async updateBranch(id: string, dto: UpdateBranchRequestDto): Promise<Branch> {
    const existing = await this.branchRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`The requested Branch with ID [${id}] was not found.`);
    }

    const data = definedFields({
      name: dto.name,
      address: dto.address,
      latitude: dto.latitude,
      longitude: dto.longitude,
      phoneNumber: dto.phoneNumber,
      operatingHours: dto.operatingHours,
      isActive: dto.isActive,
    });

    if (Object.keys(data).length === 0) {
      return existing;
    }

    this.logger.log(`Updating branch [${id}]`);
    return this.branchRepository.update(id, data);
  }

  /**
   * Soft-deletes a branch and, atomically, its tables.
   *
   * Refused while the branch has open orders — closing a location with food in
   * the kitchen would strand those orders behind a hidden branch (the KDS and
   * cashier views resolve by branch).
   *
   * Tables cascade because they have no meaning without their branch: a table
   * left active under a deleted branch would still resolve its QR code and let
   * guests place orders against a closed location.
   */
  async deleteBranch(id: string): Promise<SoftDeleteResult> {
    const existing = await this.branchRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`The requested Branch with ID [${id}] was not found.`);
    }

    const tenantId = (existing as unknown as { tenantId: string }).tenantId;
    const now = new Date();

    const activeOrders = await countActiveOrders({ branchId: id, tenantId });
    if (activeOrders > 0) {
      throw new ConflictException(
        `This branch cannot be deleted while it has ${activeOrders} order(s) in progress. Complete or cancel them first.`,
      );
    }

    // Per-row updates rather than `updateMany`: the tenant-scoped Prisma
    // extension blocks `updateMany` on scoped models to prevent isolation
    // bypasses (runtime-proven as an HTTP 500 on the equivalent category
    // cascade). Every write therefore still passes through tenant enforcement.
    await prisma.$transaction(async (tx) => {
      const rawTx = tx as unknown as {
        table: {
          findMany: (args: Record<string, unknown>) => Promise<{ id: string }[]>;
          update: (args: Record<string, unknown>) => Promise<unknown>;
        };
        branch: { update: (args: Record<string, unknown>) => Promise<unknown> };
      };

      for (;;) {
        const batch = await rawTx.table.findMany({
          where: { branchId: id, tenantId, deletedAt: null },
          select: { id: true },
          take: CASCADE_BATCH_SIZE,
        });
        if (batch.length === 0) {
          break;
        }
        for (const table of batch) {
          await rawTx.table.update({
            where: { id: table.id },
            data: { deletedAt: now },
          });
        }
        if (batch.length < CASCADE_BATCH_SIZE) {
          break;
        }
      }

      await rawTx.branch.update({
        where: { id },
        data: { deletedAt: now, isActive: false },
      });
    }, TX_OPTIONS);

    this.logger.log(`Soft-deleted branch [${id}] and its tables for tenant [${tenantId}]`);
    return { id, deleted: true };
  }

  /**
   * Restores a soft-deleted branch. Tables are not cascaded back — individual
   * tables may have been removed deliberately before the branch was closed.
   */
  async restoreBranch(id: string): Promise<RestoreResult> {
    const existing = await this.branchRepository.findByIdIncludingDeleted(id);
    if (!existing) {
      throw new NotFoundException(`The requested Branch with ID [${id}] was not found.`);
    }

    await this.branchRepository.restore(id, { isActive: true });
    this.logger.log(`Restored branch [${id}]`);
    return { id, restored: true };
  }

  // ==========================================
  // AUDIT-007 — Table update / soft-delete / restore
  // ==========================================

  /**
   * Applies a partial update to a table.
   *
   * Neither `branchId` nor `number` is accepted by the DTO: both are inputs to
   * the table's deterministic QR HMAC, so changing either would break every
   * printed sticker.
   */
  async updateTable(id: string, dto: UpdateTableRequestDto): Promise<Table> {
    const existing = await this.tableRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`The requested Table with ID [${id}] was not found.`);
    }

    const data = definedFields({
      seatingCapacity: dto.seatingCapacity,
      status: dto.status,
    });

    if (Object.keys(data).length === 0) {
      return existing;
    }

    this.logger.log(`Updating table [${id}]`);
    return this.tableRepository.update(id, data);
  }

  /**
   * Soft-deletes a table.
   *
   * Refused while the table has open orders (guests are still seated). The row
   * is preserved so historical orders keep resolving their table, and the
   * partial unique index on `qrCodeToken` (migration 20260804000000) means the
   * table number becomes reusable once deleted.
   */
  async deleteTable(id: string): Promise<SoftDeleteResult> {
    const existing = await this.tableRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`The requested Table with ID [${id}] was not found.`);
    }

    const tenantId = (existing as unknown as { tenantId: string }).tenantId;

    const activeOrders = await countActiveOrders({ tableId: id, tenantId });
    if (activeOrders > 0) {
      throw new ConflictException(
        `This table cannot be deleted while it has ${activeOrders} order(s) in progress. Complete or cancel them first.`,
      );
    }

    await this.tableRepository.softDelete(id);
    this.logger.log(`Soft-deleted table [${id}]`);
    return { id, deleted: true };
  }

  /**
   * Restores a soft-deleted table.
   *
   * Two conditions are enforced:
   *  1. The parent branch must be active — otherwise the table would resolve
   *     QR scans for a closed location.
   *  2. No live table may already hold the same QR token. Because the token is
   *     a deterministic HMAC of `tenantId:branchId:number`, recreating table
   *     "12" after deleting it produces the identical token; restoring the old
   *     row would then violate the partial unique index as a raw 500.
   */
  async restoreTable(id: string): Promise<RestoreResult> {
    const existing = (await this.tableRepository.findByIdIncludingDeleted(id)) as
      | (Table & { branchId: string; qrCodeToken: string })
      | null;
    if (!existing) {
      throw new NotFoundException(`The requested Table with ID [${id}] was not found.`);
    }

    const branch = await this.branchRepository.findById(existing.branchId);
    if (!branch) {
      throw new ConflictException(
        'This table cannot be restored because its branch is deleted. Restore the branch first.',
      );
    }

    const conflict = await this.tableRepository.findByQrCodeToken(existing.qrCodeToken);
    if (conflict && conflict.id !== id) {
      throw new ConflictException(
        `Table number [${existing.number}] has already been recreated at this branch. Delete the replacement before restoring this record.`,
      );
    }

    await this.tableRepository.restore(id);
    this.logger.log(`Restored table [${id}]`);
    return { id, restored: true };
  }
}

/**
 * Drops `undefined` keys so a partial update never nulls a column that the
 * caller simply did not mention.
 */
function definedFields(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
}

/**
 * Counts orders that are still operationally open for a branch or table.
 *
 * Uses the tenant-scoped client with an explicit `tenantId` predicate; `count`
 * is permitted by the extension (unlike `updateMany`) and is additionally
 * scoped by it.
 */
async function countActiveOrders(where: { branchId?: string; tableId?: string; tenantId: string }): Promise<number> {
  const rawPrisma = prisma as unknown as {
    order: { count: (args: Record<string, unknown>) => Promise<number> };
  };
  return rawPrisma.order.count({
    where: {
      ...(where.branchId ? { branchId: where.branchId } : {}),
      ...(where.tableId ? { tableId: where.tableId } : {}),
      tenantId: where.tenantId,
      status: { in: [...ACTIVE_ORDER_STATUSES] },
    },
  });
}
