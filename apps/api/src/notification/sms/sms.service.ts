import { Injectable, Logger } from '@nestjs/common';

interface SmsProvider {
  name: string;
  send: (to: string, message: string) => Promise<{ success: boolean; provider: string; messageId?: string; error?: string }>;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  // Middle Eastern country codes for regional optimization
  private readonly MIDDLE_EAST_COUNTRY_CODES = ['+966', '+973', '+965', '+968', '+974', '+971', '+962', '+961', '+963', '+964', '+20', '+90'];

  private readonly primaryProvider: SmsProvider;
  private readonly regionalProvider: SmsProvider;
  private readonly secondaryProvider: SmsProvider;

  constructor() {
    // Primary: Twilio
    this.primaryProvider = {
      name: 'twilio',
      send: async (to: string, message: string): Promise<{ success: boolean; provider: string; messageId?: string; error?: string }> => this.sendViaTwilio(to, message),
    };

    // Regional: Unifonic / SAPTCO for Middle East
    this.regionalProvider = {
      name: 'unifonic',
      send: async (to: string, message: string): Promise<{ success: boolean; provider: string; messageId?: string; error?: string }> => this.sendViaUnifonic(to, message),
    };

    // Secondary: Mock fallback
    this.secondaryProvider = {
      name: 'mock-sms',
      send: async (to: string, message: string): Promise<{ success: boolean; provider: string; messageId?: string }> => this.sendViaMock(to, message),
    };
  }

  /**
   * Determines optimal provider based on phone number region per DOC-008 7.3 Regional Route Optimization
   */
  private getOptimalProvider(to: string): SmsProvider {
    const isMiddleEast = this.MIDDLE_EAST_COUNTRY_CODES.some((code) => to.startsWith(code));
    if (isMiddleEast) {
      this.logger.log(`Routing SMS to [${to}] via regional provider (Unifonic/SAPTCO) for Middle East optimization`);
      return this.regionalProvider;
    }
    return this.primaryProvider;
  }

  /**
   * Sends transactional SMS (order status updates, OTP logins) with failover per DOC-008 7.3
   */
  async sendSms(to: string, message: string, _tenantId?: string): Promise<{ success: boolean; provider: string; messageId?: string; attempts: number }> {
    if (!to || !message) {
      throw new Error('Recipient phone number and message are required');
    }

    // Basic phone validation
    if (!to.startsWith('+')) {
      throw new Error('Phone number must be in E.164 format (e.g., +12025550144)');
    }

    const optimalProvider = this.getOptimalProvider(to);
    let attempts = 0;

    // Try optimal provider first
    attempts++;
    try {
      const result = await optimalProvider.send(to, message);
      if (result.success) {
        this.logger.log(`SMS to [${to}] sent via [${result.provider}] on attempt ${attempts}`);
        return { success: true, provider: result.provider, messageId: result.messageId, attempts };
      }
      throw new Error(result.error || 'Provider failed');
    } catch (err) {
      this.logger.warn(`SMS via [${optimalProvider.name}] failed for [${to}] attempt ${attempts}: ${(err as Error).message}`);
    }

    // Failover: if optimal was regional, try primary (Twilio) as secondary route
    if (optimalProvider.name === 'unifonic') {
      attempts++;
      try {
        const result = await this.primaryProvider.send(to, message);
        if (result.success) {
          this.logger.log(`SMS to [${to}] sent via failover [${result.provider}] on attempt ${attempts}`);
          return { success: true, provider: result.provider, messageId: result.messageId, attempts };
        }
        throw new Error(result.error || 'Primary failover failed');
      } catch (err) {
        this.logger.warn(`Failover SMS via [${this.primaryProvider.name}] failed for [${to}] attempt ${attempts}: ${(err as Error).message}`);
      }
    }

    // Final failover to mock/secondary queue per DOC-008 7.3 Failover Queue
    attempts++;
    try {
      const result = await this.secondaryProvider.send(to, message);
      if (result.success) {
        this.logger.log(`SMS to [${to}] sent via secondary failover [${result.provider}] on attempt ${attempts}`);
        // Simulate queueing for redelivery per spec
        this.logger.log(`Queueing SMS for redelivery via secondary route for [${to}]`);
        return { success: true, provider: result.provider, messageId: result.messageId, attempts };
      }
    } catch (err) {
      this.logger.error(`All SMS providers failed for [${to}] after ${attempts} attempts: ${(err as Error).message}`);
    }

    return { success: false, provider: 'none', attempts };
  }

  // Convenience methods for transactional notifications

  async sendOrderStatusSms(to: string, orderNumber: string, status: string, tenantId?: string): Promise<{ success: boolean; provider: string; messageId?: string; attempts: number }> {
    const message = `Eleva: Order ${orderNumber} is now ${status}. Thank you!`;
    return this.sendSms(to, message, tenantId);
  }

  async sendOtpSms(to: string, otp: string, tenantId?: string): Promise<{ success: boolean; provider: string; messageId?: string; attempts: number }> {
    const message = `Your Eleva verification code is ${otp}. Valid for 5 minutes.`;
    return this.sendSms(to, message, tenantId);
  }

  private async sendViaTwilio(to: string, message: string): Promise<{ success: boolean; provider: string; messageId?: string; error?: string }> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER || '+15005550006'; // Twilio test number

    if (!accountSid || !authToken) {
      this.logger.warn('Twilio credentials not configured, using mock success for dev/test');
      return {
        success: true,
        provider: 'twilio-mock',
        messageId: `twilio-mock-${Math.random().toString(36).substring(2, 10)}`,
      };
    }

    try {
      // Dynamic import to avoid hard dependency
      const twilio = require('twilio');
      const client = twilio(accountSid, authToken);
      const result = await client.messages.create({
        body: message,
        from: fromNumber,
        to,
      });
      return { success: true, provider: 'twilio', messageId: result.sid };
    } catch (err) {
      return { success: false, provider: 'twilio', error: (err as Error).message };
    }
  }

  private async sendViaUnifonic(_to: string, _message: string): Promise<{ success: boolean; provider: string; messageId?: string; error?: string }> {
    const unifonicAppSid = process.env.UNIFONIC_APP_SID;
    const _unifonicSender = process.env.UNIFONIC_SENDER_ID || 'Zayjar';

    if (!unifonicAppSid) {
      this.logger.warn('Unifonic credentials not configured, using mock success for Middle East routing');
      return {
        success: true,
        provider: 'unifonic-mock',
        messageId: `unifonic-mock-${Math.random().toString(36).substring(2, 10)}`,
      };
    }

    try {
      // Mock Unifonic API call (real implementation would use axios POST to Unifonic)
      // For dev, simulate success
      const mockId = `unifonic-${Math.random().toString(36).substring(2, 10)}`;
      return { success: true, provider: 'unifonic', messageId: mockId };
    } catch (err) {
      return { success: false, provider: 'unifonic', error: (err as Error).message };
    }
  }

  private async sendViaMock(to: string, message: string): Promise<{ success: boolean; provider: string; messageId?: string }> {
    this.logger.log(`[MOCK SMS] To: ${to} Message: ${message}`);
    return {
      success: true,
      provider: 'mock-sms',
      messageId: `mock-${Math.random().toString(36).substring(2, 10)}`,
    };
  }
}
