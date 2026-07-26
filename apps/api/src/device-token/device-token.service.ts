import { Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { CreateDeviceTokenRequestDto } from './dto/create-device-token-request.dto';
import { TenantDeviceTokenRepository, dbTenantContext } from '@zayjar/db';

@Injectable()
export class DeviceTokenService {
  private readonly logger = new Logger(DeviceTokenService.name);
  private readonly deviceTokenRepository = new TenantDeviceTokenRepository();

  /**
   * Registers FCM device token per DOC-008 7.4
   * Tenant isolation via dbTenantContext, token unique per tenant
   */
  async registerToken(dto: CreateDeviceTokenRequestDto, tenantId: string, requesterUserId: string): Promise<{
    id: string;
    token: string;
    deviceType: string;
    userId: string;
    createdAt?: Date;
  }> {
    const userId = dto.userId || requesterUserId;
    this.logger.log(`Registering device token for tenant [${tenantId}] user [${userId}] type [${dto.deviceType}]`);

    // Check for existing token within tenant (unique constraint)
    const existing = await dbTenantContext.run({ tenantId }, async () => {
      const found = await this.deviceTokenRepository.findMany({ token: dto.token });
      return found[0] || null;
    });

    if (existing) {
      // If same token exists for same user, update deviceType and return
      if (existing.userId === userId) {
        this.logger.log(`Device token already registered for user [${userId}], updating`);
        const updated = await dbTenantContext.run({ tenantId }, async () => {
          return this.deviceTokenRepository.update(existing.id, {
            deviceType: dto.deviceType,
            userId,
          });
        });
        return {
          id: updated.id,
          token: updated.token,
          deviceType: updated.deviceType,
          userId: updated.userId,
        };
      }
      throw new ConflictException('Device token already registered for another user under this tenant');
    }

    // Create new token
    const created = await dbTenantContext.run({ tenantId }, async () => {
      return this.deviceTokenRepository.create({
        token: dto.token,
        deviceType: dto.deviceType,
        userId,
      });
    });

    return {
      id: created.id,
      token: created.token,
      deviceType: created.deviceType,
      userId: created.userId,
      createdAt: created.createdAt,
    };
  }

  async listTokens(tenantId: string, userId?: string): Promise<Array<{
    id: string;
    token: string;
    deviceType: string;
    userId: string;
    createdAt: Date;
  }>> {
    const where: Record<string, unknown> = {};
    if (userId) {where.userId = userId;}

    const tokens = await dbTenantContext.run({ tenantId }, async () => {
      return this.deviceTokenRepository.findMany(where);
    });

    return tokens.map((t) => ({
      id: t.id,
      token: t.token,
      deviceType: t.deviceType,
      userId: t.userId,
      createdAt: t.createdAt,
    }));
  }

  async deleteToken(id: string, tenantId: string, _requesterUserId: string): Promise<{ success: boolean; id: string }> {
    const existing = await dbTenantContext.run({ tenantId }, async () => {
      return this.deviceTokenRepository.findById(id);
    });

    if (!existing) {
      throw new NotFoundException(`Device token with ID [${id}] not found`);
    }

    // Enforce user can only delete own tokens unless PLATFORM_OWNER (checked in controller)
    // For service, just ensure tenant isolation already done via findById

    await dbTenantContext.run({ tenantId }, async () => {
      return this.deviceTokenRepository.delete(id);
    });

    return { success: true, id };
  }

  /**
   * Sends FCM push notification payload structure per DOC-008 7.4
   * Mock implementation for dev/test, logs payload
   */
  async sendPushNotification(tenantId: string, userId: string, title: string, body: string, data?: Record<string, unknown>): Promise<{
    sent: number;
    payloads?: Array<{ message: Record<string, unknown> }>;
  }> {
    const tokens = await this.listTokens(tenantId, userId);

    if (tokens.length === 0) {
      this.logger.warn(`No device tokens for tenant [${tenantId}] user [${userId}], skipping push`);
      return { sent: 0 };
    }

    // In real implementation, would use Firebase Admin SDK
    // For now, log payload per DOC-008 structure and return mock success
    const payloads = tokens.map((t) => ({
      message: {
        token: t.token,
        notification: { title, body },
        data: {
          ...data,
          tenantId,
        },
      },
    }));

    this.logger.log(`Dispatching ${payloads.length} FCM notifications for tenant [${tenantId}] user [${userId}] title [${title}]`);

    // Mock send
    return {
      sent: payloads.length,
      payloads,
    };
  }
}
