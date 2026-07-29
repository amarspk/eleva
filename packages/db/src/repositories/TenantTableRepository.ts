import { BaseTenantRepository } from './BaseTenantRepository';
import { Table, prisma } from '../index';

export class TenantTableRepository extends BaseTenantRepository<Table> {
  constructor() {
    super(prisma.table);
  }

  /**
   * Safe lookup by the cryptographic QR table token (DOC-005 4.6),
   * automatically scoped to the active tenant context. Soft-deleted tables
   * never match, so an expired QR sticker is indistinguishable from an
   * unknown token.
   */
  async findByQrCodeToken(qrCodeToken: string): Promise<Table | null> {
    const tenantId = this.getTenantId();
    return this.delegate.findFirst({
      where: { qrCodeToken, tenantId, deletedAt: null },
    });
  }
}
