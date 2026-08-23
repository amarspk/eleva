import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { TenantInvoiceRepository, Invoice, prisma, dbTenantContext } from '@zayjar/db';
import { EmailService } from '../notification/email/email.service';

export interface InvoiceResendResult {
  id: string;
  sent: boolean;
  to: string;
  mocked?: boolean;
  messageId?: string;
}

/**
 * AUDIT-010 — retrieve and resend existing Invoice rows.
 *
 * Generation/storage remain in OrderService.generateInvoice. This service
 * only reads tenant-scoped invoices and reuses EmailService.sendInvoiceEmail.
 */
@Injectable()
export class InvoiceAdminService {
  private readonly logger = new Logger('InvoiceAdminService');
  private readonly invoiceRepository = new TenantInvoiceRepository();

  constructor(private readonly emailService: EmailService) {}

  async findAll(): Promise<Invoice[]> {
    return this.invoiceRepository.findMany({}, { orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string): Promise<Invoice> {
    const row = await this.invoiceRepository.findById(id);
    if (!row) {
      throw new NotFoundException(`The requested Invoice with ID [${id}] was not found.`);
    }
    return row;
  }

  async resend(id: string): Promise<InvoiceResendResult> {
    const invoice = await this.findOne(id);
    const resolved = await this.buildResendContext(invoice);

    this.logger.log(`Resending invoice [${invoice.invoiceNumber}] to [${resolved.to}]`);
    const result = await this.emailService.sendInvoiceEmail(resolved.to, {
      invoiceNumber: invoice.invoiceNumber,
      orderNumber: resolved.orderNumber,
      customerName: resolved.customerName,
      branchName: resolved.branchName,
      subtotal: resolved.subtotal,
      taxAmount: resolved.taxAmount,
      total: resolved.total,
      pdfUrl: invoice.pdfUrl,
      companyName: resolved.companyName,
    });

    if (!result.success) {
      throw new BadRequestException(
        result.reason === 'hard_bounce'
          ? 'The invoice email was blocked due to a previous hard bounce.'
          : `The invoice email could not be sent${result.error ? `: ${result.error}` : '.'}`,
      );
    }

    return {
      id: invoice.id,
      sent: true,
      to: resolved.to,
      mocked: result.mocked,
      messageId: result.messageId,
    };
  }

  private async buildResendContext(invoice: Invoice): Promise<{
    to: string;
    orderNumber: string;
    customerName: string;
    branchName: string;
    companyName: string;
    subtotal: number;
    taxAmount: number;
    total: number;
  }> {
    const requestTenantId = dbTenantContext.getStore()?.tenantId;
    const order = await prisma.order.findUnique({
      where: { id: invoice.orderId },
      select: {
        id: true,
        tenantId: true,
        orderNumber: true,
        customerId: true,
        branchId: true,
        subtotal: true,
        taxAmount: true,
        total: true,
      },
    });
    if (!order || (requestTenantId && order.tenantId !== requestTenantId)) {
      throw new NotFoundException(`The requested Invoice with ID [${invoice.id}] was not found.`);
    }

    let to: string | null = null;
    let customerName = 'Valued Customer';
    if (order.customerId) {
      const customer = await prisma.customer.findUnique({
        where: { id: order.customerId },
        select: { tenantId: true, email: true, firstName: true, lastName: true },
      });
      if (customer && customer.tenantId === order.tenantId) {
        to = customer.email?.trim() || null;
        customerName = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customerName;
      }
    }
    if (!to) {
      throw new BadRequestException('The invoice cannot be resent because the order has no customer email.');
    }

    let branchName = 'Main Branch';
    let companyName = 'Zayjar Restaurant';
    const branch = await prisma.branch.findUnique({
      where: { id: order.branchId },
      select: { tenantId: true, name: true, restaurant: { select: { name: true } } },
    });
    if (branch && branch.tenantId === order.tenantId) {
      branchName = branch.name;
      companyName = branch.restaurant?.name || companyName;
    }

    return {
      to,
      orderNumber: order.orderNumber,
      customerName,
      branchName,
      companyName,
      subtotal: Number(order.subtotal),
      taxAmount: Number(order.taxAmount),
      total: Number(order.total),
    };
  }
}
