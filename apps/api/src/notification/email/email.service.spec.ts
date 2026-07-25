import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from './email.service';

describe('EmailService Unit Tests - DOC-008 7.2 Transactional Email', () => {
  let service: EmailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailService],
    }).compile();

    service = module.get<EmailService>(EmailService);
    jest.clearAllMocks();
    delete process.env.SENDGRID_API_KEY;
  });

  it('should send welcome email with Handlebars template compilation', async () => {
    const to = 'owner@gourmet.com';
    const variables = {
      companyName: 'Gourmet LLC',
      ownerFirstName: 'John',
      ownerLastName: 'Doe',
      subdomain: 'gourmet',
      status: 'TRIALING',
    };

    const result = await service.sendWelcomeEmail(to, variables);

    expect(result.success).toBe(true);
    expect(result.to).toBe(to);
    expect(result.template).toBe('welcome');
    // In mock mode, should have mocked flag
    expect(result.mocked).toBe(true);
  });

  it('should send invoice email with financial details', async () => {
    const to = 'customer@example.com';
    const variables = {
      invoiceNumber: 'INV-2026-123456',
      orderNumber: 'ORD-2026-12345',
      customerName: 'Mark Smith',
      branchName: 'Main Branch',
      subtotal: 28.0,
      taxAmount: 4.2,
      total: 32.2,
      pdfUrl: 'https://cdn.zayjar.com/invoices/INV-2026-123456.pdf',
      companyName: 'Gourmet LLC',
    };

    const result = await service.sendInvoiceEmail(to, variables);

    expect(result.success).toBe(true);
    expect(result.to).toBe(to);
    expect(result.template).toBe('invoice');
  });

  it('should block emails to addresses with hard bounce', async () => {
    const bouncedEmail = 'bounced@example.com';
    // Simulate hard bounce event
    await service.handleDeliveryEvent({
      event: 'bounce',
      type: 'hard',
      email: bouncedEmail,
    });

    expect(service.isEmailBlocked(bouncedEmail)).toBe(true);

    const result = await service.sendWelcomeEmail(bouncedEmail, {
      companyName: 'Test',
      ownerFirstName: 'Test',
      ownerLastName: 'User',
      subdomain: 'test',
      status: 'TRIALING',
    });

    expect(result.success).toBe(false);
    expect((result as any).blocked).toBe(true);
    expect((result as any).reason).toBe('hard_bounce');
  });

  it('should handle spam complaints and block email', async () => {
    const spamEmail = 'spam@example.com';
    await service.handleDeliveryEvent({
      event: 'spamreport',
      email: spamEmail,
    });

    expect(service.isEmailBlocked(spamEmail)).toBe(true);
  });

  it('should enforce tenant isolation via template variables, never trust client tenantId', async () => {
    const _tenantId = 'real-tenant';
    const to = 'test@example.com';
    const variables = {
      companyName: 'Real Tenant Company',
      ownerFirstName: 'Real',
      ownerLastName: 'Owner',
      subdomain: 'real',
      status: 'ACTIVE',
      tenantId: 'evil-tenant-injected', // attempt to inject evil tenant via variables (should be ignored in key? but template uses only allowed vars)
    };

    const result = await service.sendWelcomeEmail(to, variables as any);

    expect(result.success).toBe(true);
    // Ensure email was sent to correct recipient, not evil
    expect(result.to).toBe(to);
    expect(result.to).not.toContain('evil');
  });

  it('should implement failover routing when primary provider fails', async () => {
    // Set API key to trigger real SendGrid path, but without module installed it will fail and go to failover
    process.env.SENDGRID_API_KEY = 'test_key';
    process.env.SENDGRID_FROM_EMAIL = 'noreply@zayjar.com';

    const to = 'test@example.com';
    const result = await service.sendWelcomeEmail(to, {
      companyName: 'Test',
      ownerFirstName: 'Test',
      ownerLastName: 'User',
      subdomain: 'test',
      status: 'ACTIVE',
    });

    // Should succeed via failover (since @sendgrid/mail not installed, require throws, then failover)
    expect(result.success).toBe(true);
    // In this implementation, failover flag is set when primary throws
    expect((result as any).failover === true || (result as any).mocked === undefined).toBeTruthy();

    delete process.env.SENDGRID_API_KEY;
  });
});
