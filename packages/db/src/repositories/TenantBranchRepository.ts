import { BaseTenantRepository } from './BaseTenantRepository';
import { Branch, prisma } from '../index';

export class TenantBranchRepository extends BaseTenantRepository<Branch> {
  /** DOC-002 §Soft Delete Policy: this table carries `deletedAt`. */
  protected readonly softDeletable = true;

  constructor() {
    super(prisma.branch);
  }
}
