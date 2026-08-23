import { Module } from '@nestjs/common';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoiceStorageService } from './invoice-storage.service';
import { InvoiceAdminService } from './invoice-admin.service';
import { InvoiceController } from './invoice.controller';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [AuthModule, NotificationModule],
  controllers: [InvoiceController],
  providers: [InvoicePdfService, InvoiceStorageService, InvoiceAdminService],
  exports: [InvoicePdfService, InvoiceStorageService, InvoiceAdminService],
})
export class InvoiceModule {}
