import { BaseTenantRepository } from './BaseTenantRepository';
import { Payment, prisma } from '../index';

/**
 * Tenant-scoped repository for payment records (AUDIT-002).
 *
 * The `payments` table existed in the schema from day one but had NO
 * repository and no application writer — the only row in a provisioned
 * database came from the seed script. Every wallet payment was therefore
 * invisible to the platform: no reconciliation ledger, no refund trail, no
 * revenue reporting, and nothing to verify a payment against.
 *
 * `Payment` has no `deletedAt` column, so `softDeletable` stays false:
 * financial records are never soft-deleted (a refund is a status transition,
 * not a deletion).
 */
export class TenantPaymentRepository extends BaseTenantRepository<Payment> {
  constructor() {
    super(prisma.payment);
  }
}
