import { BaseTenantRepository } from './BaseTenantRepository';
import { User, prisma } from '../index';

export class TenantUserRepository extends BaseTenantRepository<User> {
  /** DOC-002 §Soft Delete Policy: this table carries `deletedAt`. */
  protected readonly softDeletable = true;

  constructor() {
    super(prisma.user);
  }
}
