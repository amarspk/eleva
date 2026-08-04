import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TenantRestaurantRepository, Restaurant } from '@zayjar/db';

/**
 * Restaurant (brand) reads (AUDIT-014 / DEFECT-L).
 *
 * `Category` and `Branch` both require a `restaurantId` on create, but NO
 * endpoint ever exposed one — runtime-proven before this fix:
 *
 *   GET /api/v1/restaurants        -> 404 (route does not exist)
 *   POST /api/v1/menu/categories   -> 400 ["restaurantId should not be empty"]
 *
 * so the Backoffice could not create a category or a branch at all. The
 * repository already existed (`TenantRestaurantRepository`); only the HTTP
 * surface was missing.
 *
 * Scope is deliberately read-only. Creating and deleting restaurant brands is
 * AUDIT-008 (a separate, larger piece of work involving the onboarding wizard);
 * this adds exactly what the menu/branch UIs need to function and nothing more.
 */
@Injectable()
export class RestaurantService {
  private readonly logger = new Logger('RestaurantService');
  private readonly restaurantRepository = new TenantRestaurantRepository();

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
}
