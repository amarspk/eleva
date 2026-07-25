import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { ImageProcessorService } from './image-processor.service';
import { MediaCleanupService } from './media-cleanup.service';
import { MediaCleanupQueueService } from './media-cleanup-queue.service';
import { LocalStorageProvider } from './storage/local-storage.provider';
import { S3StorageProvider } from './storage/s3-storage.provider';
import { StorageProvider } from './storage/storage-provider.interface';

const storageProviderFactory = {
  provide: 'STORAGE_PROVIDER' as const,
  useFactory: (): StorageProvider => {
    const type = process.env.STORAGE_PROVIDER || 'local';
    switch (type) {
      case 's3':
        return new S3StorageProvider();
      case 'local':
        return new LocalStorageProvider();
      default:
        throw new Error(`Unknown STORAGE_PROVIDER "${type}". Valid: local, s3`);
    }
  },
};

@Module({
  controllers: [MediaController],
  providers: [
    storageProviderFactory,
    MediaService,
    ImageProcessorService,
    MediaCleanupService,
    MediaCleanupQueueService,
  ],
  exports: [MediaService],
})
export class MediaModule {}
