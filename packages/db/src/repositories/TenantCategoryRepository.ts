import { BaseTenantRepository } from './BaseTenantRepository';
import { Category, prisma } from '../index';

export class TenantCategoryRepository extends BaseTenantRepository<Category> {
  /** DOC-002 §Soft Delete Policy: this table carries `deletedAt`. */
  protected readonly softDeletable = true;

  constructor() {
    super(prisma.category);
  }
}
