import { Injectable, Logger } from '@nestjs/common';
import { StorageProvider, StorageUploadResult, DeleteBatchResult } from './storage-provider.interface';

@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly logger = new Logger(S3StorageProvider.name);
  private readonly bucket: string;
  private readonly region: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic SDK import, type unavailable at build time
  private s3Client: any;

  constructor() {
    this.bucket = process.env.S3_BUCKET || '';
    this.region = process.env.AWS_REGION || 'us-east-1';

    if (!this.bucket) {
      throw new Error('S3_BUCKET environment variable is required when STORAGE_PROVIDER=s3');
    }

    const accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required when STORAGE_PROVIDER=s3',
      );
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { S3Client } = require('@aws-sdk/client-s3');
      this.s3Client = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId,
          secretAccessKey,
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
    } catch (err: unknown) {
      this.logger.warn(`Failed to delete s3://${this.bucket}/${key}: ${(err as Error).message}`);
    }
  }

  async deleteBatch(keys: string[]): Promise<DeleteBatchResult> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DeleteObjectsCommand } = require('@aws-sdk/client-s3');

    const deleted: string[] = [];
    const failed: Array<{ key: string; reason: string }> = [];

    try {
      const response = await this.s3Client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })) },
        }),
      );

      if (response.Deleted) {
        for (const item of response.Deleted) {
          deleted.push(item.Key);
        }
      }

      if (response.Errors) {
        for (const err of response.Errors) {
          failed.push({ key: err.Key, reason: err.Message || 'Unknown S3 error' });
          this.logger.warn(
            `S3 batch delete error for key ${err.Key}: ${err.Message} (Code: ${err.Code})`,
          );
        }
      }

      this.logger.debug(
        `S3 batch delete: ${deleted.length} deleted, ${failed.length} failed from s3://${this.bucket}`,
      );
    } catch (err: unknown) {
      this.logger.warn(`S3 batch delete request failed: ${(err as Error).message}. Falling back to individual deletes.`);

      for (const key of keys) {
        try {
          const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
          await this.s3Client.send(
            new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
          );
          deleted.push(key);
          this.logger.debug(`Deleted s3://${this.bucket}/${key}`);
        } catch (individualErr: unknown) {
          failed.push({ key, reason: (individualErr as Error).message });
          this.logger.warn(`Failed to delete s3://${this.bucket}/${key}: ${(individualErr as Error).message}`);
        }
      }
    }

    return { deleted, failed };
  }

  getPublicUrl(key: string): string {
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }
}
