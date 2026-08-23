import { BaseTenantRepository } from './BaseTenantRepository';
import { Discount, prisma } from '../index';

/**
 * Tenant-scoped Discount rows. The model has no deletedAt — disable is
 * `active: false` (existing column). Not softDeletable.
 */
export class TenantDiscountRepository extends BaseTenantRepository<Discount> {
  constructor() {
    super(prisma.discount);
  }
}
