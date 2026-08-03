import { BaseTenantRepository } from './BaseTenantRepository';
import { Notification, prisma } from '../index';

/**
 * Tenant-scoped repository for in-app notifications (Sprint 2 Task 7).
 * The table previously had no repository — the push/notification pipeline can
 * now persist notification records with full tenant isolation.
 */
export class TenantNotificationRepository extends BaseTenantRepository<Notification> {
  constructor() {
    super(prisma.notification);
  }
}
