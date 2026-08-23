import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { InvoiceAdminService, InvoiceResendResult } from './invoice-admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

/**
 * AUDIT-010 — staff invoice list / retrieve / resend.
 * Tenant-scoped via ALS + TenantInvoiceRepository. Foreign ids 404.
 */
@Controller('api/v1/invoices')
@UseGuards(JwtAuthGuard, RbacPermissionGuard)
export class InvoiceController {
  constructor(private readonly invoiceAdminService: InvoiceAdminService) {}

  @Get()
  @RequirePermission('read', 'Invoice')
  @HttpCode(HttpStatus.OK)
  async findAll(): Promise<unknown> {
    return this.invoiceAdminService.findAll();
  }

  @Get(':id')
  @RequirePermission('read', 'Invoice')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<unknown> {
    return this.invoiceAdminService.findOne(id);
  }

  @Post(':id/resend')
  @RequirePermission('update', 'Invoice')
  @HttpCode(HttpStatus.OK)
  async resend(@Param('id', new ParseUUIDPipe()) id: string): Promise<InvoiceResendResult> {
    return this.invoiceAdminService.resend(id);
  }
}
