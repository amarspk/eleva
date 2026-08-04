import { BaseTenantRepository } from './BaseTenantRepository';
import { Restaurant, prisma } from '../index';

export class TenantRestaurantRepository extends BaseTenantRepository<Restaurant> {
  /** DOC-002 §Soft Delete Policy: this table carries `deletedAt`. */
  protected readonly softDeletable = true;

  constructor() {
    super(prisma.restaurant);
  }
}
