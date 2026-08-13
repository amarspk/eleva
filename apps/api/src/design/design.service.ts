/* eslint-disable @typescript-eslint/no-explicit-any, curly, prefer-const */
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { prisma, dbTenantContext } from '@zayjar/db';

export interface DesignData {
  colors?: { primary?: string; secondary?: string };
  fonts?: { heading?: string; body?: string };
  logo?: string | null;
  coverImage?: string | null;
  navigation?: { style?: string };
  sections?: Array<{ id: string; type: string; enabled: boolean; order: number; config: Record<string, unknown> }>;
  layout?: Record<string, unknown>;
  [k: string]: unknown;
}

const DEFAULT_SECTIONS = [
  { id: 'hero', type: 'hero', enabled: true, order: 0, config: { variant: 'split', title: 'Welcome' } },
  { id: 'categories', type: 'categories', enabled: true, order: 1, config: { variant: 'pills' } },
  { id: 'featured', type: 'featured', enabled: true, order: 2, config: { variant: 'grid' } },
  { id: 'popular', type: 'popular', enabled: false, order: 3, config: { variant: 'grid' } },
  { id: 'banner', type: 'banner', enabled: false, order: 4, config: {} },
  { id: 'promo', type: 'promo', enabled: false, order: 5, config: {} },
];

const STORED_VERSION_LIMIT = 50;
const VISIBLE_VERSION_LIMIT = 20;
const PLATFORM_DESIGN_LOCK_KEY = 'zayjar:platform-design';

@Injectable()
export class DesignService {
  /**
   * PlatformDesign has no tenantId and is intentionally outside tenant data.
   * The global Prisma fail-safe therefore requires an explicit platform context
   * for every access. Controller authorization decides who may mutate/preview;
   * the one public call below projects only the published JSON field.
   */
  private withPlatformContext<T>(operation: () => Promise<T>): Promise<T> {
    return dbTenantContext.run({ isPlatformOwner: true }, operation);
  }

  /**
   * Serializes every draft/version mutation for one tenant and keeps the row
   * mutation plus history write in the same database transaction.
   *
   * The transaction-scoped advisory lock also covers the first-write case where
   * no TenantDesign row exists yet, which a SELECT ... FOR UPDATE cannot lock.
   * `hashtext` collisions only serialize unrelated tenants; they cannot weaken
   * correctness or isolation.
   */
  private withLockedTenantDesign<T>(tenantId: string, operation: (tx: any) => Promise<T>): Promise<T> {
    return dbTenantContext.run({ tenantId }, () =>
      (prisma as any).$transaction(async (tx: any) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))::text AS lock_result`;
        return operation(tx);
      }),
    );
  }

  private withLockedPlatformDesign<T>(operation: (tx: any) => Promise<T>): Promise<T> {
    return this.withPlatformContext(() =>
      (prisma as any).$transaction(async (tx: any) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${PLATFORM_DESIGN_LOCK_KEY}))::text AS lock_result`;
        return operation(tx);
      }),
    );
  }

  private async nextTenantVersion(tx: any, tenantId: string, rowVersion: number): Promise<number> {
    const latest = await tx.tenantDesignVersion.findFirst({
      where: { tenantId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return Math.max(rowVersion, latest?.version ?? 0) + 1;
  }

  /** Keep the effective existing policy: store 50 revisions and return the latest 20. */
  private async pruneTenantVersions(tx: any, tenantId: string): Promise<void> {
    const count = await tx.tenantDesignVersion.count({ where: { tenantId } });
    const overflow = count - STORED_VERSION_LIMIT;
    if (overflow <= 0) return;

    const oldest = await tx.tenantDesignVersion.findMany({
      where: { tenantId },
      orderBy: { version: 'asc' },
      take: overflow,
      select: { id: true },
    });
    for (const item of oldest) {
      await tx.tenantDesignVersion.delete({ where: { id: item.id } });
    }
  }

  private async createTenantVersion(tx: any, tenantId: string, version: number, data: DesignData): Promise<void> {
    await tx.tenantDesignVersion.create({ data: { tenantId, version, data } });
    await this.pruneTenantVersions(tx, tenantId);
  }

  async getDesign(tenantId: string, preview = false): Promise<{ draft: DesignData; published: DesignData; version: number; publishedAt: string | null }> {
    if (!tenantId) throw new ForbiddenException('tenant required');
    return dbTenantContext.run({ tenantId }, async () => {
      const row: any = await (prisma as any).tenantDesign.findUnique({ where: { tenantId } });
      if (!row) {
        // A read must not create or implicitly publish the builder defaults.
        // The first explicit save atomically creates revision 1 with an empty
        // published projection.
        const draft = { sections: DEFAULT_SECTIONS };
        const published = {};
        return { draft, published, version: 0, publishedAt: null, preview: preview ? draft : published } as any;
      }
      return { draft: row.draft, published: row.published, version: row.version, publishedAt: row.publishedAt?.toISOString() ?? null, preview: preview ? row.draft : row.published } as any;
    });
  }

  /** Public projection: never loads or falls back to the private draft field. */
  async getPublishedDesign(tenantId: string): Promise<DesignData | null> {
    if (!tenantId) throw new ForbiddenException('tenant required');
    return dbTenantContext.run({ tenantId }, async () => {
      const row = await (prisma as any).tenantDesign.findUnique({
        where: { tenantId },
        select: { published: true },
      });
      return row ? row.published as DesignData : null;
    });
  }

  async saveDraft(tenantId: string, draft: DesignData): Promise<any> {
    return this.withLockedTenantDesign(tenantId, async (tx) => {
      const existing = await tx.tenantDesign.findUnique({ where: { tenantId } });

      if (!existing) {
        // The first private draft starts at revision 1 and published remains
        // empty until the explicit publish operation succeeds.
        const created = await tx.tenantDesign.create({
          data: { tenantId, draft, published: {}, version: 1 },
        });
        await this.createTenantVersion(tx, tenantId, 1, draft);
        return created;
      }

      const version = await this.nextTenantVersion(tx, tenantId, existing.version);
      const updated = await tx.tenantDesign.update({
        where: { tenantId },
        data: { draft, version, updatedAt: new Date() },
      });
      await this.createTenantVersion(tx, tenantId, version, draft);
      return updated;
    });
  }

  async publish(tenantId: string): Promise<any> {
    return this.withLockedTenantDesign(tenantId, async (tx) => {
      const row = await tx.tenantDesign.findUnique({ where: { tenantId } });
      if (!row) throw new NotFoundException('Design not found');

      const version = await this.nextTenantVersion(tx, tenantId, row.version);
      const updated = await tx.tenantDesign.update({
        where: { tenantId },
        data: { published: row.draft, version, publishedAt: new Date() },
      });
      await this.createTenantVersion(tx, tenantId, version, row.draft as DesignData);
      return updated;
    });
  }

  async getVersions(tenantId: string): Promise<any[]> {
    return dbTenantContext.run({ tenantId }, async () => {
      return (prisma as any).tenantDesignVersion.findMany({
        where: { tenantId },
        orderBy: { version: 'desc' },
        take: VISIBLE_VERSION_LIMIT,
      });
    });
  }

  async restore(tenantId: string, version: number): Promise<any> {
    return this.withLockedTenantDesign(tenantId, async (tx) => {
      const snapshot = await tx.tenantDesignVersion.findFirst({ where: { tenantId, version } });
      if (!snapshot) throw new NotFoundException('Version not found');

      const row = await tx.tenantDesign.findUnique({ where: { tenantId } });
      if (!row) throw new NotFoundException('Design not found');

      // Restore creates a new monotonic revision instead of rewinding or
      // reusing the historical version number. Published remains unchanged.
      const restoredVersion = await this.nextTenantVersion(tx, tenantId, row.version);
      const updated = await tx.tenantDesign.update({
        where: { tenantId },
        data: { draft: snapshot.data, version: restoredVersion, updatedAt: new Date() },
      });
      await this.createTenantVersion(tx, tenantId, restoredVersion, snapshot.data as DesignData);
      return updated;
    });
  }

  /** Public platform projection: never returns draft, even when asked with preview=true. */
  async getPublishedPlatformDesign(): Promise<DesignData | null> {
    return this.withPlatformContext(async () => {
      const row = await (prisma as any).platformDesign.findFirst({ select: { published: true } });
      return row ? row.published as DesignData : null;
    });
  }

  async getPlatformPreview(): Promise<DesignData> {
    return this.withPlatformContext(async () => {
      const row = await (prisma as any).platformDesign.findFirst({ select: { draft: true } });
      return row ? row.draft as DesignData : {};
    });
  }

  async savePlatformDraft(data: DesignData): Promise<any> {
    return this.withLockedPlatformDesign(async (tx) => {
      const row = await tx.platformDesign.findFirst();
      if (!row) return tx.platformDesign.create({ data: { draft: data, published: {}, version: 1 } });
      return tx.platformDesign.update({
        where: { id: row.id },
        data: { draft: data, version: row.version + 1 },
      });
    });
  }

  async publishPlatform(): Promise<any> {
    return this.withLockedPlatformDesign(async (tx) => {
      const row = await tx.platformDesign.findFirst();
      if (!row) throw new NotFoundException('Platform design not found');
      return tx.platformDesign.update({
        where: { id: row.id },
        data: { published: row.draft, version: row.version + 1, publishedAt: new Date() },
      });
    });
  }
}
