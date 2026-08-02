import { Injectable, Logger } from '@nestjs/common';
import { StorageProvider } from '../media/storage/storage-provider.interface';
import { LocalStorageProvider } from '../media/storage/local-storage.provider';
import { S3StorageProvider } from '../media/storage/s3-storage.provider';

export interface StoredInvoice {
  storageKey: string;
  url: string;
  size: number;
}

/**
 * Persists generated invoice PDFs through the same storage abstraction the
 * media pipeline uses (StorageProvider: local filesystem by default, S3 when
 * STORAGE_PROVIDER=s3). The returned url is the real public URL of the PDF —
 * `/uploads/invoices/<tenantId>/<invoiceNumber>.pdf` locally (served by the
 * API's static assets route added in main.ts), or the S3 object URL.
 */
@Injectable()
export class InvoiceStorageService {
  private readonly logger = new Logger(InvoiceStorageService.name);
  private readonly storageProvider: StorageProvider;

  constructor() {
    const type = process.env.STORAGE_PROVIDER || 'local';
    switch (type) {
      case 's3':
        this.storageProvider = new S3StorageProvider();
        break;
      case 'local':
        this.storageProvider = new LocalStorageProvider();
        break;
      default:
        throw new Error(`Unknown STORAGE_PROVIDER "${type}". Valid: local, s3`);
    }
  }

  /**
   * Stores an invoice PDF under a deterministic, tenant-scoped key:
   * `invoices/<tenantId>/<invoiceNumber>.pdf`. Re-uploading the same invoice
   * number overwrites the existing file (idempotent by design).
   */
  async storePdf(tenantId: string, invoiceNumber: string, pdf: Buffer): Promise<StoredInvoice> {
    const sanitizedNumber = invoiceNumber.replace(/[^A-Za-z0-9._-]/g, '_');
    const key = `invoices/${tenantId}/${sanitizedNumber}.pdf`;
    const result = await this.storageProvider.upload(key, pdf, 'application/pdf');
    this.logger.debug(`Stored invoice PDF at ${result.url} (${result.size} bytes)`);
    return { storageKey: result.storageKey, url: result.url, size: result.size };
  }
}
