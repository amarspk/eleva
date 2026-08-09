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

@Injectable()
export class DesignService {
  async getDesign(tenantId: string, preview = false): Promise<{ draft: DesignData; published: DesignData; version: number; publishedAt: string | null }> {
    if (!tenantId) throw new ForbiddenException('tenant required');
    return dbTenantContext.run({ tenantId }, async () => {
      let row: any = await (prisma as any).tenantDesign.findUnique({ where: { tenantId } });
      if (!row) {
        row = await (prisma as any).tenantDesign.create({ data: { tenantId, draft: { sections: DEFAULT_SECTIONS }, published: { sections: DEFAULT_SECTIONS } } });
      }
      return { draft: row.draft, published: row.published, version: row.version, publishedAt: row.publishedAt?.toISOString() ?? null, preview: preview ? row.draft : row.published } as any;
    });
  }

  async saveDraft(tenantId: string, draft: DesignData): Promise<any> {
    return dbTenantContext.run({ tenantId }, async () => {
      let row: any = await (prisma as any).tenantDesign.findUnique({ where: { tenantId } });
      if (!row) row = await (prisma as any).tenantDesign.create({ data: { tenantId, draft, published: draft } });
      else row = await (prisma as any).tenantDesign.update({ where: { tenantId }, data: { draft, updatedAt: new Date() } });
      // auto version snapshot every save (keep last 20)
      const count = await (prisma as any).tenantDesignVersion.count({ where: { tenantId } });
      if (count >= 50) {
        const oldest = await (prisma as any).tenantDesignVersion.findFirst({ where: { tenantId }, orderBy: { version: 'asc' } });
        if (oldest) await (prisma as any).tenantDesignVersion.delete({ where: { id: oldest.id } });
      }
      await (prisma as any).tenantDesignVersion.create({ data: { tenantId, version: row.version + 1, data: draft } });
      return row;
    });
  }

  async publish(tenantId: string): Promise<any> {
    return dbTenantContext.run({ tenantId }, async () => {
      const row: any = await (prisma as any).tenantDesign.findUnique({ where: { tenantId } });
      if (!row) throw new NotFoundException('Design not found');
      const updated = await (prisma as any).tenantDesign.update({ where: { tenantId }, data: { published: row.draft, version: row.version + 1, publishedAt: new Date() } });
      await (prisma as any).tenantDesignVersion.create({ data: { tenantId, version: updated.version, data: row.draft } });
      return updated;
    });
  }

  async getVersions(tenantId: string): Promise<any[]> {
    return dbTenantContext.run({ tenantId }, async () => {
      return (prisma as any).tenantDesignVersion.findMany({ where: { tenantId }, orderBy: { version: 'desc' }, take: 20 });
    });
  }

  async restore(tenantId: string, version: number): Promise<any> {
    return dbTenantContext.run({ tenantId }, async () => {
      const snap: any = await (prisma as any).tenantDesignVersion.findFirst({ where: { tenantId, version } });
      if (!snap) throw new NotFoundException('Version not found');
      return (prisma as any).tenantDesign.update({ where: { tenantId }, data: { draft: snap.data } });
    });
  }

  // Platform
  async getPlatformDesign(preview = false): Promise<any> {
    let row: any = await (prisma as any).platformDesign.findFirst();
    if (!row) row = await (prisma as any).platformDesign.create({ data: { draft: {}, published: {} } });
    return preview ? row.draft : row.published;
  }
  async savePlatformDraft(data: DesignData): Promise<any> {
    let row: any = await (prisma as any).platformDesign.findFirst();
    if (!row) return (prisma as any).platformDesign.create({ data: { draft: data, published: data } });
    return (prisma as any).platformDesign.update({ where: { id: row.id }, data: { draft: data } });
  }
  async publishPlatform(): Promise<any> {
    const row: any = await (prisma as any).platformDesign.findFirst();
    if (!row) throw new NotFoundException('Platform design not found');
    return (prisma as any).platformDesign.update({ where: { id: row.id }, data: { published: row.draft, version: row.version + 1, publishedAt: new Date() } });
  }
}
