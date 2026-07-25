import { Injectable, Logger } from '@nestjs/common';
import { OnApplicationBootstrap } from '@nestjs/common';
import { prisma } from '@zayjar/db';

@Injectable()
export class MediaCleanupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MediaCleanupService.name);

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('Running media orphan cleanup...');
    await this.cleanupStaleProcessingRecords();
    await this.cleanupDeletedEntityReferences();
    this.logger.log('Media orphan cleanup completed');
  }

  private async cleanupStaleProcessingRecords(): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    try {
      const stale = await prisma.media.findMany({
        where: {
          status: 'processing',
          createdAt: { lt: oneHourAgo },
        },
      });

      if (stale.length > 0) {
        this.logger.warn(`Found ${stale.length} stale processing records, cleaning up`);
        await prisma.media.deleteMany({
          where: {
            status: 'processing',
            createdAt: { lt: oneHourAgo },
          },
        });
      }
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.warn(`Failed to cleanup stale processing records: ${error.message}`);
    }
  }

  private async cleanupDeletedEntityReferences(): Promise<void> {
    try {
      const orphanMedia = await prisma.$queryRawUnsafe<any[]>(`
        SELECT m.id FROM media m
        WHERE m.status = 'ready'
        AND m.entityType = 'product'
        AND NOT EXISTS (
          SELECT 1 FROM products p WHERE p.id = m."entityId" AND p."deletedAt" IS NULL
        )
      `);

      if (orphanMedia.length > 0) {
        this.logger.warn(`Found ${orphanMedia.length} orphan media records for deleted products`);
        const ids = orphanMedia.map((m: any) => m.id);
        await prisma.media.deleteMany({
          where: { id: { in: ids } },
        });
      }
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.debug(`Orphan entity cleanup skipped: ${error.message}`);
    }
  }
}
