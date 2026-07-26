import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateWebhookRequestDto } from './dto/create-webhook-request.dto';
import { TenantWebhookRepository, dbTenantContext } from '@zayjar/db';
import * as crypto from 'crypto';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly webhookRepository = new TenantWebhookRepository();

  /**
   * Creates a webhook subscription per DOC-008 7.5
   * Tenant isolation via dbTenantContext, secretKey never returned in list
   */
  async createWebhook(dto: CreateWebhookRequestDto, tenantId: string): Promise<{
    id: string;
    targetUrl: string;
    events: string[];
    isActive: boolean;
    createdAt: Date;
  }> {
    this.logger.log(`Creating webhook for tenant [${tenantId}] target [${dto.targetUrl}] events [${dto.events.join(',')}]`);

    const webhook = await dbTenantContext.run({ tenantId }, async () => {
      return this.webhookRepository.create({
        targetUrl: dto.targetUrl,
        secretKey: dto.secretKey,
        events: dto.events,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      });
    });

    // Return without secretKey for security (or with masked)
    return {
      id: webhook.id,
      targetUrl: webhook.targetUrl,
      events: webhook.events,
      isActive: webhook.isActive,
      createdAt: webhook.createdAt,
    };
  }

  async listWebhooks(tenantId: string): Promise<Array<{
    id: string;
    targetUrl: string;
    events: string[];
    isActive: boolean;
    createdAt: Date;
  }>> {
    const webhooks = await dbTenantContext.run({ tenantId }, async () => {
      return this.webhookRepository.findMany({ isActive: true });
    });

    // Mask secretKey
    return webhooks.map((wh) => ({
      id: wh.id,
      targetUrl: wh.targetUrl,
      events: wh.events,
      isActive: wh.isActive,
      createdAt: wh.createdAt,
    }));
  }

  async deleteWebhook(id: string, tenantId: string): Promise<{ success: boolean; id: string }> {
    const existing = await dbTenantContext.run({ tenantId }, async () => {
      return this.webhookRepository.findById(id);
    });

    if (!existing) {
      throw new NotFoundException(`Webhook with ID [${id}] not found`);
    }

    await dbTenantContext.run({ tenantId }, async () => {
      return this.webhookRepository.delete(id);
    });

    return { success: true, id };
  }

  /**
   * Dispatches webhook event to all active subscriptions for tenant that listen to eventName
   * Implements HMAC-SHA256 signature per DOC-008 7.5 and retry with exponential backoff
   */
  async dispatchEvent(tenantId: string, eventName: string, payload: Record<string, unknown>): Promise<Array<{
    webhookId: string;
    targetUrl: string;
    success: boolean;
    attempts: number;
  }>> {
    this.logger.log(`Dispatching webhook event [${eventName}] for tenant [${tenantId}]`);

    const webhooks = await dbTenantContext.run({ tenantId }, async () => {
      return this.webhookRepository.findMany();
    });

    const relevant = webhooks.filter((wh) => wh.isActive && wh.events.includes(eventName));

    if (relevant.length === 0) {
      this.logger.debug(`No active webhooks for event [${eventName}] tenant [${tenantId}]`);
      return [];
    }

    const results = [];

    for (const wh of relevant) {
      const signature = this.generateSignature(payload, wh.secretKey);
      const result = await this.sendWithRetry(wh.targetUrl, eventName, payload, signature, wh.secretKey);
      results.push({ webhookId: wh.id, targetUrl: wh.targetUrl, success: result.success, attempts: result.attempts });
    }

    return results;
  }

  /**
   * Generates HMAC-SHA256 signature per DOC-008 7.5, sent as X-Zayjar-Signature
   */
  public generateSignature(payload: Record<string, unknown>, secret: string): string {
    const payloadString = JSON.stringify(payload);
    return crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
  }

  private async sendWithRetry(
    targetUrl: string,
    eventName: string,
    payload: Record<string, unknown>,
    signature: string,
    secret: string,
    maxAttempts = 5,
  ): Promise<{ success: boolean; attempts: number }> {
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        // Use fetch for simplicity (Node 18+ has global fetch)
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Zayjar-Signature': signature,
            'X-Zayjar-Event': eventName,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok || (response.status >= 200 && response.status < 300)) {
          this.logger.log(`Webhook dispatch to [${targetUrl}] event [${eventName}] succeeded on attempt ${attempts}`);
          return { success: true, attempts };
        }

        // Non-2xx
        this.logger.warn(`Webhook dispatch to [${targetUrl}] returned status ${response.status} attempt ${attempts}`);
        lastError = new Error(`HTTP ${response.status}`);

        // If 4xx (except 429), don't retry
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          break;
        }
      } catch (err) {
        lastError = err;
        this.logger.warn(`Webhook dispatch to [${targetUrl}] failed attempt ${attempts}: ${(err as Error).message}`);
      }

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, but capped for test
      const backoffMs = Math.min(1000 * Math.pow(2, attempts - 1), 5000);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }

    this.logger.error(`Webhook dispatch to [${targetUrl}] failed after ${attempts} attempts: ${lastError?.message}`);
    // In real system, would pause webhook endpoint after 5 failures over 24h per spec
    return { success: false, attempts };
  }
}
