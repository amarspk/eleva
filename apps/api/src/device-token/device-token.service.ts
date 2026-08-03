import { Injectable, Logger, ConflictException, NotFoundException, Inject, Optional } from '@nestjs/common';
import { CreateDeviceTokenRequestDto } from './dto/create-device-token-request.dto';
import { TenantDeviceTokenRepository, TenantNotificationRepository, dbTenantContext } from '@zayjar/db';
import { FcmService } from '../fcm/fcm.service';

@Injectable()
export class DeviceTokenService {
  private readonly logger = new Logger(DeviceTokenService.name);
  private readonly deviceTokenRepository = new TenantDeviceTokenRepository();
  private readonly notificationRepository = new TenantNotificationRepository();

  constructor(
    @Optional() @Inject(FcmService) private readonly fcmService?: FcmService,
  ) {}

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
   * Sends an FCM push notification per DOC-008 7.4 (Sprint 2 Task 7).
   *
   * When FCM is configured (FcmService.isAvailable()), sends real push
   * messages through the Firebase Admin SDK, prunes registration tokens that
   * are no longer registered, and persists an in-app Notification row for the
   * recipient. When FCM is NOT configured, it preserves the previous
   * log-only behavior (dev/test fallback) — identical output contract
   * ({ sent, payloads }) in both paths.
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

    // Real FCM path (Sprint 2 Task 7).
    if (this.fcmService?.isAvailable()) {
      const { successCount, unregisteredTokens } = await this.fcmService.sendPush(
        tokens.map((t) => t.token),
        title,
        body,
        { ...(data || {}), tenantId },
      );

      if (unregisteredTokens.length > 0) {
        this.logger.warn(
          `Pruning ${unregisteredTokens.length} unregistered FCM token(s) for tenant [${tenantId}] user [${userId}]`,
        );
        await Promise.all(
          unregisteredTokens.map(async (token) => {
            const match = tokens.find((t) => t.token === token);
            if (match) {
              await dbTenantContext.run({ tenantId }, async () => {
                await this.deviceTokenRepository.delete(match.id);
              }).catch((err) => this.logger.warn(`Failed to prune token [${token}]: ${(err as Error).message}`));
            }
          }),
        );
      }

      // Persist an in-app notification mirror for the recipient.
      await this.persistNotification(tenantId, userId, title, body, 'push');

      this.logger.log(
        `Sent ${successCount}/${tokens.length} FCM notifications for tenant [${tenantId}] user [${userId}] title [${title}]`,
      );
      return { sent: successCount, payloads };
    }

    // Fallback: log-only (previous behavior, dev/test).
    this.logger.log(`Dispatching ${payloads.length} FCM notifications for tenant [${tenantId}] user [${userId}] title [${title}]`);

    return {
      sent: payloads.length,
      payloads,
    };
  }

  /**
   * Persists an in-app notification row (tenant-scoped). Failures are logged
   * and never fail the push send.
   */
  private async persistNotification(
    tenantId: string,
    userId: string,
    title: string,
    body: string,
    type: string,
  ): Promise<void> {
    try {
      await dbTenantContext.run({ tenantId }, async () => {
        await this.notificationRepository.create({
          recipientType: 'USER',
          recipientId: userId,
          title,
          body,
          type,
        });
      });
    } catch (err) {
      this.logger.warn(`Failed to persist notification for tenant [${tenantId}] user [${userId}]: ${(err as Error).message}`);
    }
  }
}
