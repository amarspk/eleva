import { Module } from '@nestjs/common';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoiceStorageService } from './invoice-storage.service';

@Module({
  providers: [InvoicePdfService, InvoiceStorageService],
  exports: [InvoicePdfService, InvoiceStorageService],
})
export class InvoiceModule {}
