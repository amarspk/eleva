import { Injectable, Logger } from '@nestjs/common';
import { StorageProvider, StorageUploadResult } from './storage-provider.interface';

@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly logger = new Logger(S3StorageProvider.name);
  private readonly bucket: string;
  private readonly region: string;
  private s3Client: any;

  constructor() {
    this.bucket = process.env.S3_BUCKET || '';
    this.region = process.env.AWS_REGION || 'us-east-1';

    if (!this.bucket) {
      throw new Error('S3_BUCKET environment variable is required when STORAGE_PROVIDER=s3');
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { S3Client } = require('@aws-sdk/client-s3');
      this.s3Client = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        },
      });
    } catch {
      this.logger.error('@aws-sdk/client-s3 is not installed. Cannot use S3StorageProvider.');
      throw new Error('@aws-sdk/client-s3 is required when STORAGE_PROVIDER=s3');
    }
  }

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<StorageUploadResult> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PutObjectCommand } = require('@aws-sdk/client-s3');

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );

    const url = this.getPublicUrl(key);
    this.logger.debug(`Uploaded ${buffer.length} bytes to s3://${this.bucket}/${key}`);

    return { storageKey: key, url, size: buffer.length };
  }

  async delete(key: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      this.logger.debug(`Deleted s3://${this.bucket}/${key}`);
    } catch (err: any) {
      this.logger.warn(`Failed to delete s3://${this.bucket}/${key}: ${err.message}`);
    }
  }

  async deleteBatch(keys: string[]): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DeleteObjectsCommand } = require('@aws-sdk/client-s3');

    try {
      await this.s3Client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })) },
        }),
      );
      this.logger.debug(`Deleted ${keys.length} objects from s3://${this.bucket}`);
    } catch (err: any) {
      this.logger.warn(`Batch delete failed: ${err.message}`);
      for (const key of keys) {
        await this.delete(key);
      }
    }
  }

  getPublicUrl(key: string): string {
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }
}
