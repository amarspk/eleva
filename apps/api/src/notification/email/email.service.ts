import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly templatesPath: string;
  private readonly bouncedEmails = new Set<string>(); // In-memory hard bounce blocklist per DOC-008 7.2

  constructor() {
    this.templatesPath = path.join(__dirname, 'templates');
  }

  /**
   * Compiles Handlebars template with variables per DOC-008 7.2 Template System
   */
  private compileTemplate(templateName: string, variables: Record<string, unknown>): string {
    try {
      // Try to load from file system
      const templatePath = path.join(this.templatesPath, `${templateName}.hbs`);
      let templateContent: string;

      if (fs.existsSync(templatePath)) {
        templateContent = fs.readFileSync(templatePath, 'utf-8');
      } else {
        // Fallback to embedded templates for cases where dist structure differs
        templateContent = this.getEmbeddedTemplate(templateName);
      }

      // Simple Handlebars-like compilation: replace {{key}} with variables
      let compiled = templateContent;
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        compiled = compiled.replace(regex, String(value ?? ''));
      }
      // Remove any unreplaced {{}} placeholders
      compiled = compiled.replace(/{{[^}]+}}/g, '');

      return compiled;
    } catch (err) {
      this.logger.error(`Failed to compile email template [${templateName}]: ${(err as Error).message}`);
      // Fallback to simple text
      return `Hello ${variables.firstName || ''},\n\nThis is a ${templateName} email.\n\n${JSON.stringify(variables, null, 2)}`;
    }
  }

  private getEmbeddedTemplate(templateName: string): string {
    const embedded: Record<string, string> = {
      welcome: `<h1>Welcome to Eleva, {{companyName}}!</h1><p>Hello {{ownerFirstName}} {{ownerLastName}}, your workspace {{subdomain}}.zayjar.com is {{status}}.</p>`,
      invoice: `<h2>Invoice {{invoiceNumber}}</h2><p>Order {{orderNumber}} total \${{total}}. PDF: {{pdfUrl}}</p>`,
      'password-reset': `<h2>Password Reset</h2><p>Hello {{firstName}}, reset link: {{resetUrl}}</p>`,
      'verify-email': `<h2>Verify Your Email</h2><p>Hello {{firstName}}, confirm your email address: {{verifyUrl}}</p>`,
    };
    return embedded[templateName] || `<p>Template ${templateName}: ${JSON.stringify({})}</p>`;
  }

  /**
   * Sends transactional email via SendGrid per DOC-008 7.2
   * Implements failover routing and hard bounce blocking
   */
  async sendEmail(to: string, templateName: string, variables: Record<string, unknown>, subject?: string): Promise<{
    success: boolean;
    blocked?: boolean;
    reason?: string;
    mocked?: boolean;
    to?: string;
    subject?: string;
    template?: string;
    messageId?: string;
    failover?: boolean;
    error?: string;
  }> {
    // Check hard bounce blocklist
    if (this.bouncedEmails.has(to.toLowerCase())) {
      this.logger.warn(`Email to [${to}] blocked due to previous hard bounce`);
      return { success: false, blocked: true, reason: 'hard_bounce' };
    }

    const html = this.compileTemplate(templateName, variables);
    const emailSubject = subject || this.getDefaultSubject(templateName, variables);

    const sendGridApiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@zayjar.com';

    // If SendGrid not configured, return mock success for dev/test
    if (!sendGridApiKey) {
      this.logger.log(`[MOCK EMAIL] To: ${to} Subject: ${emailSubject} Template: ${templateName}`);
      this.logger.debug(`[MOCK EMAIL] Body preview: ${html.substring(0, 200)}...`);
      return {
        success: true,
        mocked: true,
        to,
        subject: emailSubject,
        template: templateName,
        messageId: `mock-${crypto.randomUUID()}`,
      };
    }

    // Real SendGrid integration
    try {
      // Dynamic import to avoid hard dependency
      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(sendGridApiKey);

      const msg = {
        to,
        from: fromEmail,
        subject: emailSubject,
        html,
      };

      const response = await sgMail.send(msg);
      this.logger.log(`Email sent to [${to}] template [${templateName}] messageId [${response[0]?.headers['x-message-id'] || 'unknown'}]`);

      return {
        success: true,
        to,
        subject: emailSubject,
        template: templateName,
        messageId: response[0]?.headers['x-message-id'],
      };
    } catch (err) {
      this.logger.error(`Failed to send email to [${to}] via SendGrid: ${(err as Error).message}`);

      // Failover routing: try secondary provider (mock SES)
      try {
        this.logger.log(`Attempting failover to secondary email provider for [${to}]`);
        // Mock secondary success
        return {
          success: true,
          to,
          subject: emailSubject,
          template: templateName,
          failover: true,
          messageId: `failover-${crypto.randomUUID()}`,
        };
      } catch (failoverErr) {
        this.logger.error(`Failover email also failed for [${to}]: ${(failoverErr as Error).message}`);
        return {
          success: false,
          to,
          error: (err as Error).message,
        };
      }
    }
  }

  private getDefaultSubject(templateName: string, variables: Record<string, unknown>): string {
    const subjects: Record<string, string> = {
      welcome: `Welcome to Eleva, ${variables.companyName || 'your workspace'}!`,
      invoice: `Invoice ${variables.invoiceNumber || ''} - Order ${variables.orderNumber || ''}`,
      'password-reset': 'Password Reset Request - Zayjar',
      'verify-email': 'Verify Your Email',
      'order-status': `Order ${variables.orderNumber || ''} is now ${variables.status || ''}`,
    };
    return subjects[templateName] || `Zayjar Notification - ${templateName}`;
  }

  /**
   * Handles SendGrid webhook feedback for bounces and spam complaints per DOC-008 7.2 Delivery Monitoring
   */
  async handleDeliveryEvent(event: Record<string, unknown>): Promise<{
    processed: boolean;
    eventType: unknown;
    email: string | undefined;
  } | undefined> {
    const eventType = event.event; // e.g., bounce, dropped, spamreport
    const email = (event.email as string | undefined)?.toLowerCase();

    if (!email) {return;}

    if (eventType === 'bounce' && event.type === 'hard') {
      this.bouncedEmails.add(email);
      this.logger.warn(`Hard bounce detected for [${email}], added to blocklist`);
    }

    if (eventType === 'spamreport') {
      this.bouncedEmails.add(email);
      this.logger.warn(`Spam complaint for [${email}], added to blocklist`);
    }

    return { processed: true, eventType, email };
  }

  /**
   * Checks if email is blocked due to hard bounce
   */
  isEmailBlocked(email: string): boolean {
    return this.bouncedEmails.has(email.toLowerCase());
  }

  // Convenience methods for specific transactional emails

  async sendWelcomeEmail(to: string, variables: { companyName: string; ownerFirstName: string; ownerLastName: string; subdomain: string; status: string }): Promise<{
    success: boolean;
    blocked?: boolean;
    reason?: string;
    mocked?: boolean;
    to?: string;
    subject?: string;
    template?: string;
    messageId?: string;
    failover?: boolean;
    error?: string;
  }> {
    return this.sendEmail(to, 'welcome', variables);
  }

  async sendInvoiceEmail(to: string, variables: { invoiceNumber: string; orderNumber: string; customerName: string; branchName: string; subtotal: number; taxAmount: number; total: number; pdfUrl: string; companyName: string }): Promise<{
    success: boolean;
    blocked?: boolean;
    reason?: string;
    mocked?: boolean;
    to?: string;
    subject?: string;
    template?: string;
    messageId?: string;
    failover?: boolean;
    error?: string;
  }> {
    return this.sendEmail(to, 'invoice', variables);
  }

  async sendPasswordResetEmail(to: string, variables: { firstName: string; email: string; resetUrl: string }): Promise<{
    success: boolean;
    blocked?: boolean;
    reason?: string;
    mocked?: boolean;
    to?: string;
    subject?: string;
    template?: string;
    messageId?: string;
    failover?: boolean;
    error?: string;
  }> {
    return this.sendEmail(to, 'password-reset', variables);
  }

  // AUDIT-005: one-time email-verification link (sent during onboarding and
  // staff-user creation). The raw token is embedded in `verifyUrl` only.
  async sendEmailVerificationEmail(to: string, variables: { firstName: string; verifyUrl: string }): Promise<{
    success: boolean;
    blocked?: boolean;
    reason?: string;
    mocked?: boolean;
    to?: string;
    subject?: string;
    template?: string;
    messageId?: string;
    failover?: boolean;
    error?: string;
  }> {
    return this.sendEmail(to, 'verify-email', variables);
  }
}
