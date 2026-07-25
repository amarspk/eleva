import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageProvider, StorageUploadResult } from './storage-provider.interface';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly basePath: string;

  constructor() {
    this.basePath = process.env.STORAGE_LOCAL_PATH || './uploads';
  }

  async upload(key: string, buffer: Buffer, _mimeType: string): Promise<StorageUploadResult> {
    const filePath = path.join(this.basePath, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);

    const url = `/uploads/${key}`;
    this.logger.debug(`Uploaded ${buffer.length} bytes to ${filePath}`);

    return { storageKey: key, url, size: buffer.length };
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.basePath, key);
    try {
      await fs.unlink(filePath);
      this.logger.debug(`Deleted ${filePath}`);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        this.logger.warn(`Failed to delete ${filePath}: ${err.message}`);
      }
    }
  }

  async deleteBatch(keys: string[]): Promise<void> {
    for (const key of keys) {
      await this.delete(key);
    }
  }

  getPublicUrl(key: string): string {
    return `/uploads/${key}`;
  }
}
