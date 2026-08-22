import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import {
  TenantRestaurantRepository,
  TenantBranchRepository,
  Restaurant,
} from '@zayjar/db';
import { CreateRestaurantRequestDto } from './dto/create-restaurant-request.dto';
import { UpdateRestaurantRequestDto } from './dto/update-restaurant-request.dto';
import { SubscriptionService } from '../subscription/subscription.service';

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
 * Restaurant (brand) reads + writes.
 *
 * Reads: AUDIT-014 DEFECT-L (list / get — already shipped).
 * Writes: AUDIT-008 — create / update / soft-delete / restore using the
 * existing Restaurant columns and TenantRestaurantRepository. Soft-delete
 * only (DOC-002): Branch and Category FKs are ON DELETE RESTRICT, so a
 * hard delete would either 500 or destroy history.
 */
@Injectable()
export class RestaurantService {
  private readonly logger = new Logger('RestaurantService');
  private readonly restaurantRepository = new TenantRestaurantRepository();
  private readonly branchRepository = new TenantBranchRepository();

  constructor(private readonly subscriptionService: SubscriptionService) {}

  /** Lists the tenant's restaurant brands. Soft-deleted rows are hidden. */
  async findAll(includeDeleted = false): Promise<Restaurant[]> {
    return this.restaurantRepository.findMany(
      includeDeleted ? { deletedAt: undefined } : {},
      { orderBy: { name: 'asc' } },
    );
  }

  /** Single brand, tenant-scoped. */
  async findOne(id: string): Promise<Restaurant> {
    const restaurant = await this.restaurantRepository.findById(id);
    if (!restaurant) {
      throw new NotFoundException(`The requested Restaurant with ID [${id}] was not found.`);
    }
    return restaurant;
  }

  /**
   * Creates a brand under the authenticated tenant.
   * Enforces SubscriptionPlan.maxRestaurants (existing plan column).
   */
  async create(dto: CreateRestaurantRequestDto, tenantId: string): Promise<Restaurant> {
    await this.subscriptionService.checkRestaurantLimit(tenantId);

    this.logger.log(`Creating restaurant brand: [${dto.name}]`);
    return this.restaurantRepository.create({
      name: dto.name,
      currency: dto.currency ?? 'USD',
      timezone: dto.timezone ?? 'UTC',
      taxPercentage: dto.taxPercentage ?? 0,
    });
  }

  /** Partial update. Unknown / foreign id → 404 (no existence oracle). */
  async update(id: string, dto: UpdateRestaurantRequestDto): Promise<Restaurant> {
    const existing = await this.restaurantRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`The requested Restaurant with ID [${id}] was not found.`);
    }

    const data = definedFields({
      name: dto.name,
      currency: dto.currency,
      timezone: dto.timezone,
      taxPercentage: dto.taxPercentage,
    });

    if (Object.keys(data).length === 0) {
      return existing;
    }

    this.logger.log(`Updating restaurant [${id}]`);
    return this.restaurantRepository.update(id, data);
  }

  /**
   * Soft-deletes a brand. Refused while any live branch still belongs to it
   * (Branch.restaurantId is ON DELETE RESTRICT; leaving live branches under
   * an archived brand would keep QR/KDS paths pointing at a hidden parent).
   */
  async remove(id: string): Promise<SoftDeleteResult> {
    const existing = await this.restaurantRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`The requested Restaurant with ID [${id}] was not found.`);
    }

    const liveBranches = await this.branchRepository.count({ restaurantId: id });
    if (liveBranches > 0) {
      throw new ConflictException(
        `This restaurant cannot be deleted while it has ${liveBranches} live branch(es). Archive the branches first.`,
      );
    }

    await this.restaurantRepository.softDelete(id);
    this.logger.log(`Soft-deleted restaurant [${id}]`);
    return { id, deleted: true };
  }

  /** Restores a soft-deleted brand. Branches are not cascaded back. */
  async restore(id: string): Promise<RestoreResult> {
    const existing = await this.restaurantRepository.findByIdIncludingDeleted(id);
    if (!existing) {
      throw new NotFoundException(`The requested Restaurant with ID [${id}] was not found.`);
    }

    await this.restaurantRepository.restore(id);
    this.logger.log(`Restored restaurant [${id}]`);
    return { id, restored: true };
  }
}

function definedFields(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
}
