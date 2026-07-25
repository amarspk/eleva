export interface StorageUploadResult {
  storageKey: string;
  url: string;
  size: number;
}

export interface StorageProvider {
  upload(key: string, buffer: Buffer, mimeType: string): Promise<StorageUploadResult>;
  delete(key: string): Promise<void>;
  deleteBatch(keys: string[]): Promise<void>;
  getPublicUrl(key: string): string;
}
