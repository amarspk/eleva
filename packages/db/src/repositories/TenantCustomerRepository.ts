import { BaseTenantRepository } from './BaseTenantRepository';
import { Customer, prisma } from '../index';

export class TenantCustomerRepository extends BaseTenantRepository<Customer> {
  /** DOC-002 §Soft Delete Policy: this table carries `deletedAt`. */
  protected readonly softDeletable = true;

  constructor() {
    super(prisma.customer);
  }
}
