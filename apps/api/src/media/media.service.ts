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

const PG_SERIALIZATION_ERROR = '40001';
const PG_DEADLOCK_ERROR = '40P01';
const MAX_SERIALIZATION_RETRIES = 3;

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

    const existingMedia = await prisma.media.findFirst({
      where: { tenantId, entityType, entityId, mediaType: mediaType as any, status: 'ready' },
    });

    // SERIALIZABLE isolation prevents two concurrent uploads for the same
    // entity/mediaType from both creating new records. Under READ COMMITTED,
    // both transactions would see the same existingMedia, both create new
    // records, and both succeed — leaving duplicate active records.
    // SERIALIZABLE causes the second transaction to detect the conflict
    // and fail with a serialization error, which we retry.
    //
    // FILES ARE WRITTEN INSIDE the retry loop, NOT before it.
    // Each attempt processes and uploads files independently. If the transaction
    // fails with a serialization error, every file written during that attempt
    // is synchronously deleted before the next retry starts. This ensures zero
    // orphaned files regardless of how many retries occur.
    const { media, shouldDeleteOldFiles, oldStorageKey } = await this.serializableRetry(async () => {
      const attemptStorageKeys: string[] = [];

      try {
        let attemptStorageKey: string;
        let attemptUrls: typeof urls;
        let attemptWidth: number | undefined;
        let attemptHeight: number | undefined;
        let attemptFileSize: number;

        if (existingByChecksum) {
          attemptStorageKey = existingByChecksum.storageKey;
          attemptUrls = {
            originalUrl: existingByChecksum.originalUrl,
            thumbnailUrl: existingByChecksum.thumbnailUrl,
            mediumUrl: existingByChecksum.mediumUrl,
            largeUrl: existingByChecksum.largeUrl,
          };
          attemptWidth = existingByChecksum.width ?? undefined;
          attemptHeight = existingByChecksum.height ?? undefined;
          attemptFileSize = existingByChecksum.fileSize;
        } else {
          const attemptPrefix = `tenants/${tenantId}/${mediaType.toLowerCase()}`;
          const attemptFilePrefix = `${Date.now()}-${checksum.substring(0, 8)}`;
          attemptStorageKey = `${attemptPrefix}/${attemptFilePrefix}`;

          if (mediaType === 'DOCUMENT') {
            const result = await this.storageProvider.upload(
              `${attemptStorageKey}.pdf`,
              file.buffer,
              file.mimetype,
            );
            attemptStorageKey = result.storageKey;
            attemptStorageKeys.push(result.storageKey);
            attemptUrls = { originalUrl: result.url, thumbnailUrl: null, mediumUrl: null, largeUrl: null };
            attemptWidth = undefined;
            attemptHeight = undefined;
            attemptFileSize = result.size;
          } else {
            const processed = await this.imageProcessor.processImage(
              file.buffer,
              mediaType as keyof typeof MEDIA_TYPE_CONFIG,
            );

            if ('original' in processed) {
              const imageKeys = [
                `${attemptStorageKey}-original.webp`,
                `${attemptStorageKey}-thumbnail.webp`,
                `${attemptStorageKey}-medium.webp`,
                `${attemptStorageKey}-large.webp`,
              ];

              // Track keys BEFORE uploading so if Promise.all partially fails,
              // the catch block can clean up successfully-uploaded files.
              attemptStorageKeys.push(...imageKeys);

              const [originalResult, thumbnailResult, mediumResult, largeResult] = await Promise.all([
                this.storageProvider.upload(imageKeys[0], processed.original.buffer, 'image/webp'),
                this.storageProvider.upload(imageKeys[1], processed.thumbnail.buffer, 'image/webp'),
                this.storageProvider.upload(imageKeys[2], processed.medium.buffer, 'image/webp'),
                this.storageProvider.upload(imageKeys[3], processed.large.buffer, 'image/webp'),
              ]);
              attemptStorageKey = `${attemptPrefix}/${attemptFilePrefix}`;
              attemptUrls = {
                originalUrl: originalResult.url,
                thumbnailUrl: thumbnailResult.url,
                mediumUrl: mediumResult.url,
                largeUrl: largeResult.url,
              };
              attemptWidth = processed.original.width;
              attemptHeight = processed.original.height;
              attemptFileSize = originalResult.size;
            } else {
              throw new BadRequestException('Unexpected processing result');
            }
          }
        }

        const result = await prisma.$transaction(async (tx: any) => {
          const currentExisting = existingMedia
            ? await tx.media.findFirst({
                where: { id: existingMedia.id, status: 'ready' },
              })
            : null;

          const created = await tx.media.create({
            data: {
              tenantId,
              entityType,
              entityId,
              mediaType,
              originalName: file.originalname,
              mimeType: file.mimetype,
              originalFileSize: file.size,
              fileSize: attemptFileSize,
              checksum,
              width: attemptWidth ?? null,
              height: attemptHeight ?? null,
              storageKey: attemptStorageKey,
              storageProvider: this.storageProvider.constructor.name,
              originalUrl: attemptUrls.originalUrl,
              thumbnailUrl: attemptUrls.thumbnailUrl,
              mediumUrl: attemptUrls.mediumUrl,
              largeUrl: attemptUrls.largeUrl,
              status: 'ready',
            },
          });

          const urlField = ENTITY_URL_MAP[entityType]?.[mediaType];
          if (urlField) {
            if (entityType === 'restaurant') {
              await tx.tenant.update({
                where: { id: tenantId },
                data: { [urlField]: attemptUrls.originalUrl },
              });
            } else if (entityType === 'product') {
              await tx.product.update({
                where: { id: entityId },
                data: { [urlField]: attemptUrls.originalUrl },
              });
            }
          }

          let shouldDeleteOldFiles = false;
          let deletedStorageKey: string | undefined;

          if (currentExisting) {
            deletedStorageKey = currentExisting.storageKey;
            await tx.media.deleteMany({ where: { id: currentExisting.id } });

            const remainingCount = await tx.media.count({
              where: { storageKey: currentExisting.storageKey, status: 'ready' },
            });
            shouldDeleteOldFiles = remainingCount === 0;
          }

          return { media: created, shouldDeleteOldFiles, oldStorageKey: deletedStorageKey };
        }, {
          isolationLevel: 'Serializable' as const,
          timeout: 10000,
        });

        return result;
      } catch (err: any) {
        const isRetryableError =
          err?.code === PG_SERIALIZATION_ERROR ||
          err?.code === PG_DEADLOCK_ERROR ||
          err?.message?.includes('serialization failure');

        if (isRetryableError && attemptStorageKeys.length > 0) {
          this.logger.warn(
            `Cleaning up ${attemptStorageKeys.length} files from failed attempt before retry`,
          );
          const result = await this.storageProvider.deleteBatch(attemptStorageKeys);

          if (result.failed.length > 0) {
            for (const f of result.failed) {
              this.logger.error(
                `[MediaCleanup] Failed to delete file from failed upload attempt: key=${f.key} reason=${f.reason}`,
              );
            }
            this.cleanupQueue.enqueue({
              type: 'ROLLBACK',
              storageKeys: result.failed.map((f) => f.key),
            });
          }
        }

        throw err;
      }
    });

    // File deletion for replaced old records is async and outside the transaction.
    if (shouldDeleteOldFiles && oldStorageKey) {
      this.enqueueCleanup(oldStorageKey, 'REPLACE');
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

    const shouldDeleteFiles = await this.serializableRetry(async () => {
      return prisma.$transaction(async (tx: any) => {
        // Re-read inside SERIALIZABLE tx to get latest state
        const currentMedia = await tx.media.findFirst({ where: { id, tenantId } });
        if (!currentMedia) {
          return false;
        }

        const urlField = ENTITY_URL_MAP[currentMedia.entityType]?.[currentMedia.mediaType];
        if (urlField) {
          if (currentMedia.entityType === 'restaurant') {
            await tx.tenant.update({
              where: { id: tenantId },
              data: { [urlField]: null },
            });
          } else if (currentMedia.entityType === 'product') {
            await tx.product.update({
              where: { id: currentMedia.entityId },
              data: { [urlField]: null },
            });
          }
        }

        // deleteMany is idempotent — safe if record was already removed
        await tx.media.deleteMany({ where: { id } });

        // Refcount check AFTER deletion, INSIDE the transaction.
        const remainingCount = await tx.media.count({
          where: { storageKey: currentMedia.storageKey, status: 'ready' },
        });
        return remainingCount === 0;
      }, {
        isolationLevel: 'Serializable' as const,
        timeout: 10000,
      });
    });

    if (shouldDeleteFiles) {
      this.enqueueCleanup(media.storageKey, 'DELETE');
    }
  }

  async rollbackFiles(storageKeys: string[]): Promise<void> {
    this.cleanupQueue.enqueue({
      type: 'ROLLBACK',
      storageKeys,
    });
  }

  /**
   * Executes a transaction callback with SERIALIZABLE isolation and retries
   * on PostgreSQL serialization failures (error code 40001).
   *
   * Under READ COMMITTED, two concurrent uploads for the same entity/mediaType
   * would both see the same existingMedia, both create new records, and both
   * succeed — leaving duplicate active records. SERIALIZABLE causes the second
   * transaction to detect the read-write conflict and fail. We retry so the
   * second attempt sees the first transaction's committed result.
   */
  private async serializableRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= MAX_SERIALIZATION_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        const isRetryableError =
          err?.code === PG_SERIALIZATION_ERROR ||
          err?.code === PG_DEADLOCK_ERROR ||
          err?.message?.includes('serialization failure');

        if (!isRetryableError || attempt === MAX_SERIALIZATION_RETRIES) {
          if (isRetryableError) {
            this.logger.error(
              `Exhausted ${MAX_SERIALIZATION_RETRIES} retry attempts for serializable transaction`,
            );
          }
          throw err;
        }

        this.logger.warn(
          `Serialization conflict on attempt ${attempt}/${MAX_SERIALIZATION_RETRIES}, retrying...`,
        );
      }
    }
    throw new Error('Unreachable: serializableRetry exceeded retries');
  }

  private enqueueCleanup(
    storageKey: string,
    type: 'REPLACE' | 'DELETE' | 'ROLLBACK',
  ): void {
    // IMAGE types store key as `.../prefix` (no extension); actual files are
    // `prefix-original.webp`, `prefix-thumbnail.webp`, etc.
    // DOCUMENT type stores key as `.../prefix.pdf` (extension already included).
    const keys = [
      `${storageKey}-original.webp`,
      `${storageKey}-thumbnail.webp`,
      `${storageKey}-medium.webp`,
      `${storageKey}-large.webp`,
    ];

    if (storageKey.endsWith('.pdf')) {
      // Document: storageKey already includes `.pdf`
      keys.push(storageKey);
    } else {
      // Image: append `.pdf` doesn't apply, but we push the image keys above.
      // No additional keys needed.
    }

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
