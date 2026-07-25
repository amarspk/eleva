import { Injectable, Logger, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { prisma } from '@zayjar/db';
import { MEDIA_TYPE_CONFIG } from '@zayjar/types';
import { StorageProvider } from './storage/storage-provider.interface';
import { ImageProcessorService } from './image-processor.service';
import { MediaCleanupQueueService } from './media-cleanup-queue.service';
import { MediaResponseDto } from './dto/media-response.dto';

const ENTITY_URL_MAP: Record<string, Record<string, string>> = {
  restaurant: {
    LOGO: 'logoUrl',
    BANNER: 'bannerUrl',
  },
  product: {
    IMAGE: 'imageUrl',
  },
};

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @Inject('STORAGE_PROVIDER') private readonly storageProvider: StorageProvider,
    private readonly imageProcessor: ImageProcessorService,
    private readonly cleanupQueue: MediaCleanupQueueService,
  ) {}

  async upload(
    file: Express.Multer.File,
    entityType: string,
    entityId: string,
    mediaType: string,
    tenantId: string,
  ): Promise<MediaResponseDto> {
    const config = MEDIA_TYPE_CONFIG[mediaType as keyof typeof MEDIA_TYPE_CONFIG];
    if (!config) {
      throw new BadRequestException(`Invalid media type: ${mediaType}`);
    }

    if (!config.allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type "${file.mimetype}". Allowed: ${config.allowedTypes.join(', ')}`,
      );
    }

    if (file.size > config.maxSize) {
      throw new BadRequestException(
        `File size ${file.size} exceeds maximum ${config.maxSize} for ${mediaType}`,
      );
    }

    const checksum = this.imageProcessor.computeChecksum(file.buffer);

    const existingByChecksum = await prisma.media.findFirst({
      where: { tenantId, checksum, status: 'ready' },
    });

    let storageKey: string;
    let urls: { originalUrl: string; thumbnailUrl: string | null; mediumUrl: string | null; largeUrl: string | null };
    let width: number | undefined;
    let height: number | undefined;
    let fileSize: number;

    if (existingByChecksum) {
      this.logger.log(`Dedup match found for checksum ${checksum}, reusing storage`);
      storageKey = existingByChecksum.storageKey;
      urls = {
        originalUrl: existingByChecksum.originalUrl,
        thumbnailUrl: existingByChecksum.thumbnailUrl,
        mediumUrl: existingByChecksum.mediumUrl,
        largeUrl: existingByChecksum.largeUrl,
      };
      width = existingByChecksum.width ?? undefined;
      height = existingByChecksum.height ?? undefined;
      fileSize = existingByChecksum.fileSize;
    } else {
      const storagePrefix = `tenants/${tenantId}/${mediaType.toLowerCase()}`;
      const filePrefix = `${Date.now()}-${checksum.substring(0, 8)}`;
      storageKey = `${storagePrefix}/${filePrefix}`;

      if (mediaType === 'DOCUMENT') {
        const result = await this.storageProvider.upload(
          `${storageKey}.pdf`,
          file.buffer,
          file.mimetype,
        );
        storageKey = result.storageKey;
        urls = { originalUrl: result.url, thumbnailUrl: null, mediumUrl: null, largeUrl: null };
        width = undefined;
        height = undefined;
        fileSize = result.size;
      } else {
        const processed = await this.imageProcessor.processImage(
          file.buffer,
          mediaType as keyof typeof MEDIA_TYPE_CONFIG,
        );

        if ('original' in processed) {
          const [originalResult, thumbnailResult, mediumResult, largeResult] = await Promise.all([
            this.storageProvider.upload(`${storageKey}-original.webp`, processed.original.buffer, 'image/webp'),
            this.storageProvider.upload(`${storageKey}-thumbnail.webp`, processed.thumbnail.buffer, 'image/webp'),
            this.storageProvider.upload(`${storageKey}-medium.webp`, processed.medium.buffer, 'image/webp'),
            this.storageProvider.upload(`${storageKey}-large.webp`, processed.large.buffer, 'image/webp'),
          ]);

          storageKey = `${storagePrefix}/${filePrefix}`;
          urls = {
            originalUrl: originalResult.url,
            thumbnailUrl: thumbnailResult.url,
            mediumUrl: mediumResult.url,
            largeUrl: largeResult.url,
          };
          width = processed.original.width;
          height = processed.original.height;
          fileSize = originalResult.size;
        } else {
          throw new BadRequestException('Unexpected processing result');
        }
      }
    }

    const existingMedia = await prisma.media.findFirst({
      where: { tenantId, entityType, entityId, mediaType: mediaType as any, status: 'ready' },
    });

    const media = await prisma.$transaction(async (tx: any) => {
      const created = await tx.media.create({
        data: {
          tenantId,
          entityType,
          entityId,
          mediaType,
          originalName: file.originalname,
          mimeType: file.mimetype,
          originalFileSize: file.size,
          fileSize,
          checksum,
          width: width ?? null,
          height: height ?? null,
          storageKey,
          storageProvider: this.storageProvider.constructor.name,
          originalUrl: urls.originalUrl,
          thumbnailUrl: urls.thumbnailUrl,
          mediumUrl: urls.mediumUrl,
          largeUrl: urls.largeUrl,
          status: 'ready',
        },
      });

      const urlField = ENTITY_URL_MAP[entityType]?.[mediaType];
      if (urlField) {
        if (entityType === 'restaurant') {
          await tx.tenant.update({
            where: { id: tenantId },
            data: { [urlField]: urls.originalUrl },
          });
        } else if (entityType === 'product') {
          await tx.product.update({
            where: { id: entityId },
            data: { [urlField]: urls.originalUrl },
          });
        }
      }

      return created;
    });

    if (existingMedia) {
      // Check refcount BEFORE deleting the old record.
      // This count includes the old Media record itself.
      // If refcount = 1, only the old record references this storageKey.
      // After we delete it, refcount will be 0 → safe to delete files.
      // If refcount > 1, the new Media shares storageKey via dedup → keep files.
      const oldRefcount = await prisma.media.count({
        where: { storageKey: existingMedia.storageKey, status: 'ready' },
      });

      await prisma.media.delete({ where: { id: existingMedia.id } });

      if (oldRefcount === 1) {
        this.enqueueCleanup(existingMedia.storageKey, 'REPLACE');
      }
    }

    return this.toResponseDto(media);
  }

  async findAll(
    tenantId: string,
    entityType?: string,
    entityId?: string,
  ): Promise<MediaResponseDto[]> {
    const where: any = { tenantId, status: 'ready' };
    if (entityType) {
      where.entityType = entityType;
    }
    if (entityId) {
      where.entityId = entityId;
    }

    const media = await prisma.media.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return media.map((m) => this.toResponseDto(m));
  }

  async findOne(id: string, tenantId: string): Promise<MediaResponseDto> {
    const media = await prisma.media.findFirst({
      where: { id, tenantId },
    });

    if (!media) {
      throw new NotFoundException(`Media with ID "${id}" not found`);
    }

    return this.toResponseDto(media);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const media = await prisma.media.findFirst({
      where: { id, tenantId },
    });

    if (!media) {
      throw new NotFoundException(`Media with ID "${id}" not found`);
    }

    // Check refcount BEFORE deletion.
    // This count includes the record itself.
    // If refcount = 1, only this record references the storageKey.
    // After deletion, refcount will be 0 → safe to delete files.
    // If refcount > 1, other records share the storageKey → keep files.
    const refCount = await prisma.media.count({
      where: { storageKey: media.storageKey, status: 'ready' },
    });

    await prisma.$transaction(async (tx: any) => {
      const urlField = ENTITY_URL_MAP[media.entityType]?.[media.mediaType];
      if (urlField) {
        if (media.entityType === 'restaurant') {
          await tx.tenant.update({
            where: { id: tenantId },
            data: { [urlField]: null },
          });
        } else if (media.entityType === 'product') {
          await tx.product.update({
            where: { id: media.entityId },
            data: { [urlField]: null },
          });
        }
      }

      await tx.media.delete({ where: { id } });
    });

    if (refCount === 1) {
      this.enqueueCleanup(media.storageKey, 'DELETE');
    }
  }

  async rollbackFiles(storageKeys: string[]): Promise<void> {
    this.cleanupQueue.enqueue({
      type: 'ROLLBACK',
      storageKeys,
    });
  }

  private enqueueCleanup(
    storageKey: string,
    type: 'REPLACE' | 'DELETE' | 'ROLLBACK',
  ): void {
    const keys = [
      `${storageKey}-original.webp`,
      `${storageKey}-thumbnail.webp`,
      `${storageKey}-medium.webp`,
      `${storageKey}-large.webp`,
      `${storageKey}.pdf`,
    ];

    this.cleanupQueue.enqueue({ type, storageKeys: keys });
  }

  private toResponseDto(media: any): MediaResponseDto {
    return {
      id: media.id,
      tenantId: media.tenantId,
      entityType: media.entityType,
      entityId: media.entityId,
      mediaType: media.mediaType,
      originalName: media.originalName,
      mimeType: media.mimeType,
      originalFileSize: media.originalFileSize,
      fileSize: media.fileSize,
      checksum: media.checksum,
      width: media.width,
      height: media.height,
      storageKey: media.storageKey,
      storageProvider: media.storageProvider,
      originalUrl: media.originalUrl,
      thumbnailUrl: media.thumbnailUrl,
      mediumUrl: media.mediumUrl,
      largeUrl: media.largeUrl,
      status: media.status,
      createdAt: media.createdAt,
      updatedAt: media.updatedAt,
    };
  }
}
