import { BaseTenantRepository } from './BaseTenantRepository';
import { KitchenQueue, prisma } from '../index';

export class TenantKitchenQueueRepository extends BaseTenantRepository<KitchenQueue> {
  constructor() {
    super(prisma.kitchenQueue);
  }
}
