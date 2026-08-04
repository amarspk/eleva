import { BaseTenantRepository } from './BaseTenantRepository';
import { Product, prisma } from '../index';

export class TenantProductRepository extends BaseTenantRepository<Product> {
  /** DOC-002 §Soft Delete Policy: this table carries `deletedAt`. */
  protected readonly softDeletable = true;

  constructor() {
    super(prisma.product);
  }
}
