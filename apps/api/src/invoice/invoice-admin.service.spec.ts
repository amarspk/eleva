import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { InvoiceAdminService } from './invoice-admin.service';
import { InvoiceController } from './invoice.controller';
import { EmailService } from '../notification/email/email.service';
import { REQUIRE_PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';

const repoState: { one: Record<string, unknown> | null; list: Record<string, unknown>[] } = {
  one: null,
  list: [],
};

const prismaState: {
  order: Record<string, unknown> | null;
  customer: Record<string, unknown> | null;
  branch: Record<string, unknown> | null;
} = {
  order: null,
  customer: null,
  branch: null,
};

jest.mock('@zayjar/db', () => {
  class Stub {
    async findById(): Promise<null> {
      return null;
    }
  }
  class TenantInvoiceRepository {
    async findById(): Promise<unknown> {
      return repoState.one;
    }
    async findMany(): Promise<unknown[]> {
      return repoState.list;
    }
  }
  return {
    TenantInvoiceRepository,
    TenantDiscountRepository: Stub,
    TenantProductRepository: Stub,
    TenantCategoryRepository: Stub,
    TenantCustomerRepository: Stub,
    TenantOrderRepository: Stub,
    TenantBranchRepository: Stub,
    TenantUserRepository: Stub,
    TenantTableRepository: Stub,
    TenantRestaurantRepository: Stub,
    dbTenantContext: {
      getStore: () => ({ tenantId: '80a00898-782c-4a6e-8bad-880e8f4f7977' }),
    },
    prisma: {
      order: {
        findUnique: jest.fn(async () => prismaState.order),
      },
      customer: {
        findUnique: jest.fn(async () => prismaState.customer),
      },
      branch: {
        findUnique: jest.fn(async () => prismaState.branch),
      },
    },
  };
});

const INVOICE_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = '192c2d1d-cc77-4759-808d-8a6e5dc40350';
const TENANT_ID = '80a00898-782c-4a6e-8bad-880e8f4f7977';

describe('InvoiceAdminService — AUDIT-010', () => {
  let service: InvoiceAdminService;
  let email: { sendInvoiceEmail: jest.Mock };

  beforeEach(async () => {
    email = {
      sendInvoiceEmail: jest.fn().mockResolvedValue({
        success: true,
        mocked: true,
        to: 'sara.mutairi@email.com',
        messageId: 'mock-1',
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [InvoiceAdminService, { provide: EmailService, useValue: email }],
    }).compile();
    service = module.get(InvoiceAdminService);
    repoState.one = {
      id: INVOICE_ID,
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
      invoiceNumber: 'INV-2026-100001',
      pdfUrl: '/uploads/invoices/t/INV-2026-100001.pdf',
    };
    repoState.list = [repoState.one];
    prismaState.order = {
      id: ORDER_ID,
      tenantId: TENANT_ID,
      orderNumber: 'ALB-R-00001',
      customerId: '386031ba-950f-43b9-8edf-a0043d696340',
      branchId: 'b09e5d1c-7f77-42ad-8ca9-c6012854bf0b',
      subtotal: 61,
      taxAmount: 9.15,
      total: 70.15,
    };
    prismaState.customer = {
      tenantId: TENANT_ID,
      email: 'sara.mutairi@email.com',
      firstName: 'Sara',
      lastName: 'Al-Mutairi',
    };
    prismaState.branch = {
      tenantId: TENANT_ID,
      name: 'Riyadh - Olaya Branch',
      restaurant: { name: 'Al-Baik Chicken' },
    };
  });

  it('lists tenant invoices', async () => {
    await expect(service.findAll()).resolves.toHaveLength(1);
  });

  it('404s get/resend for unknown or foreign ids', async () => {
    repoState.one = null;
    await expect(service.findOne(INVOICE_ID)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.resend(INVOICE_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(email.sendInvoiceEmail).not.toHaveBeenCalled();
  });

  it('resends via EmailService.sendInvoiceEmail to the order customer', async () => {
    const result = await service.resend(INVOICE_ID);
    expect(result).toMatchObject({
      id: INVOICE_ID,
      sent: true,
      to: 'sara.mutairi@email.com',
      mocked: true,
    });
    expect(email.sendInvoiceEmail).toHaveBeenCalledWith(
      'sara.mutairi@email.com',
      expect.objectContaining({
        invoiceNumber: 'INV-2026-100001',
        orderNumber: 'ALB-R-00001',
        pdfUrl: '/uploads/invoices/t/INV-2026-100001.pdf',
        total: 70.15,
      }),
    );
  });

  it('does not resend when the order has no customer email', async () => {
    prismaState.customer = { tenantId: TENANT_ID, email: '', firstName: 'Sara', lastName: 'X' };
    await expect(service.resend(INVOICE_ID)).rejects.toBeInstanceOf(BadRequestException);
    expect(email.sendInvoiceEmail).not.toHaveBeenCalled();
  });

  it('404s when the invoice order belongs to another tenant', async () => {
    prismaState.order = { ...prismaState.order, tenantId: '930c9c66-06df-4029-8ee8-ac4d0046c6af' };
    await expect(service.resend(INVOICE_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(email.sendInvoiceEmail).not.toHaveBeenCalled();
  });
});

describe('InvoiceController AUDIT-010 authorization metadata', () => {
  it.each([
    ['findAll', 'read'],
    ['findOne', 'read'],
    ['resend', 'update'],
  ] as const)('%s requires %s on Invoice', (method, action) => {
    const meta = Reflect.getMetadata(
      REQUIRE_PERMISSION_KEY,
      InvoiceController.prototype[method],
    );
    expect(meta).toEqual({ action, resource: 'Invoice' });
  });
});
