import { Test, TestingModule } from '@nestjs/testing';
import { DeviceTokenService } from './device-token.service';
import { TenantDeviceTokenRepository, TenantNotificationRepository, dbTenantContext } from '@zayjar/db';
import { ConflictException } from '@nestjs/common';
import { FcmService } from '../fcm/fcm.service';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock-hash'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

describe('DeviceTokenService Unit Tests - TSK-3.1 (DOC-008 7.4 FCM)', () => {
  let service: DeviceTokenService;
  const mockFcmService = {
    isAvailable: jest.fn().mockReturnValue(false),
    sendPush: jest.fn().mockResolvedValue({ successCount: 0, failureCount: 0, unregisteredTokens: [] }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceTokenService,
        { provide: FcmService, useValue: mockFcmService },
      ],
    }).compile();

    service = module.get<DeviceTokenService>(DeviceTokenService);
    jest.clearAllMocks();
    mockFcmService.isAvailable.mockReturnValue(false);
  });

  it('should register FCM device token scoped to tenant', async () => {
    const tenantId = 'tenant-123';
    const userId = 'user-123';
    const dto = {
      token: 'fcm_token_val_123...',
      deviceType: 'android',
    };

    jest.spyOn(TenantDeviceTokenRepository.prototype, 'findMany').mockResolvedValue([]);
    jest.spyOn(TenantDeviceTokenRepository.prototype, 'create').mockResolvedValue({
      id: 'dt_123',
      token: dto.token,
      deviceType: dto.deviceType,
      userId,
      createdAt: new Date().toISOString(),
    } as any);

    const result = await service.registerToken(dto as any, tenantId, userId);

    expect(result.id).toBe('dt_123');
    expect(result.token).toBe(dto.token);
    expect(result.deviceType).toBe(dto.deviceType);
  });

  it('should update existing token if same user re-registers same token', async () => {
    const tenantId = 'tenant-123';
    const userId = 'user-123';
    const dto = {
      token: 'fcm_token_val_123...',
      deviceType: 'ios',
    };

    const existing = {
      id: 'dt_123',
      token: dto.token,
      userId,
      deviceType: 'android',
    };

    jest.spyOn(TenantDeviceTokenRepository.prototype, 'findMany').mockResolvedValue([existing] as any);
    jest.spyOn(TenantDeviceTokenRepository.prototype, 'update').mockResolvedValue({
      id: 'dt_123',
      token: dto.token,
      deviceType: 'ios',
      userId,
    } as any);

    const result = await service.registerToken(dto as any, tenantId, userId);

    expect(result.deviceType).toBe('ios');
  });

  it('should throw ConflictException if token already registered for another user under same tenant', async () => {
    const tenantId = 'tenant-123';
    const userId = 'user-123';
    const dto = {
      token: 'fcm_token_shared',
      deviceType: 'web',
    };

    const existingOtherUser = {
      id: 'dt_456',
      token: dto.token,
      userId: 'other-user-999',
    };

    jest.spyOn(TenantDeviceTokenRepository.prototype, 'findMany').mockResolvedValue([existingOtherUser] as any);

    await expect(service.registerToken(dto as any, tenantId, userId)).rejects.toThrow(ConflictException);
  });

  it('should enforce tenant isolation via dbTenantContext', async () => {
    const realTenantId = 'real-tenant';
    const dto = {
      token: 'fcm_token_123',
      deviceType: 'android',
    };

    let capturedTenantId: string | null = null;
    jest.spyOn(dbTenantContext, 'run').mockImplementation((ctx: any, cb: any) => {
      capturedTenantId = ctx.tenantId;
      return cb();
    });

    jest.spyOn(TenantDeviceTokenRepository.prototype, 'findMany').mockResolvedValue([]);
    jest.spyOn(TenantDeviceTokenRepository.prototype, 'create').mockResolvedValue({
      id: 'dt_1',
      token: dto.token,
      deviceType: dto.deviceType,
      userId: 'user-1',
    } as any);

    await service.registerToken(dto as any, realTenantId, 'user-1');

    expect(capturedTenantId).toBe(realTenantId);
  });

  it('should list tokens with tenant scoping', async () => {
    const tenantId = 'tenant-123';
    const mockTokens = [
      { id: 'dt_1', token: 'token1', deviceType: 'android', userId: 'user-1', createdAt: new Date().toISOString() },
      { id: 'dt_2', token: 'token2', deviceType: 'ios', userId: 'user-1', createdAt: new Date().toISOString() },
    ];

    jest.spyOn(TenantDeviceTokenRepository.prototype, 'findMany').mockResolvedValue(mockTokens as any);

    const result = await service.listTokens(tenantId, 'user-1');

    expect(result.length).toBe(2);
  });

  it('should delete token with tenant isolation', async () => {
    const tenantId = 'tenant-123';
    const tokenId = 'dt_123';

    jest.spyOn(TenantDeviceTokenRepository.prototype, 'findById').mockResolvedValue({
      id: tokenId,
      token: 'some-token',
      userId: 'user-1',
    } as any);

    jest.spyOn(TenantDeviceTokenRepository.prototype, 'delete').mockResolvedValue({ id: tokenId } as any);

    const result = await service.deleteToken(tokenId, tenantId, 'user-1');

    expect(result.success).toBe(true);
    expect(result.id).toBe(tokenId);
  });

  it('should send FCM push notification payload per DOC-008 7.4 structure', async () => {
    const tenantId = 'tenant-123';
    const userId = 'user-123';
    const mockTokens = [
      { id: 'dt_1', token: 'fcm_token_123', deviceType: 'android', userId, createdAt: new Date().toISOString() },
    ];

    jest.spyOn(TenantDeviceTokenRepository.prototype, 'findMany').mockResolvedValue(mockTokens as any);

    const result = await service.sendPushNotification(tenantId, userId, 'New Order Placed', 'Order ORD-2026-10045 was successfully submitted.', {
      orderId: 'o888c-9a1b-42b8-bf83-097a18fcd341',
      action: 'view_order',
    });

    expect(result.sent).toBe(1);
    const msg = result.payloads![0].message as {
      notification: { title: string; body: string };
      data: Record<string, unknown>;
    };
    expect(msg.notification.title).toBe('New Order Placed');
    expect(msg.notification.body).toContain('ORD-2026');
    expect(msg.data.orderId).toBe('o888c-9a1b-42b8-bf83-097a18fcd341');
  });

  // ==========================================
  // Real FCM path (Sprint 2 Task 7)
  // ==========================================
  it('should send a real FCM multicast when FCM is available and return the success count', async () => {
    const tenantId = 'tenant-123';
    const userId = 'user-123';
    const mockTokens = [
      { id: 'dt_1', token: 'fcm_token_123', deviceType: 'android', userId, createdAt: new Date().toISOString() },
      { id: 'dt_2', token: 'fcm_token_456', deviceType: 'ios', userId, createdAt: new Date().toISOString() },
    ];
    jest.spyOn(TenantDeviceTokenRepository.prototype, 'findMany').mockResolvedValue(mockTokens as any);
    mockFcmService.isAvailable.mockReturnValue(true);
    mockFcmService.sendPush.mockResolvedValue({
      successCount: 2,
      failureCount: 0,
      unregisteredTokens: [],
    });
    jest.spyOn(TenantNotificationRepository.prototype, 'create').mockResolvedValue({ id: 'n-1' } as any);

    const result = await service.sendPushNotification(tenantId, userId, 'New Order Placed', 'Order ready', {
      orderId: 'o-1',
    });

    expect(mockFcmService.sendPush).toHaveBeenCalledWith(
      ['fcm_token_123', 'fcm_token_456'],
      'New Order Placed',
      'Order ready',
      expect.objectContaining({ orderId: 'o-1', tenantId }),
    );
    expect(result.sent).toBe(2);
    expect(result.payloads).toHaveLength(2);
    // In-app notification mirror persisted.
    expect(TenantNotificationRepository.prototype.create).toHaveBeenCalledTimes(1);
  });

  it('should prune unregistered tokens when FCM reports them', async () => {
    const tenantId = 'tenant-123';
    const userId = 'user-123';
    const mockTokens = [
      { id: 'dt_1', token: 'fcm_token_ok', deviceType: 'android', userId, createdAt: new Date().toISOString() },
      { id: 'dt_2', token: 'fcm_token_stale', deviceType: 'ios', userId, createdAt: new Date().toISOString() },
    ];
    jest.spyOn(TenantDeviceTokenRepository.prototype, 'findMany').mockResolvedValue(mockTokens as any);
    mockFcmService.isAvailable.mockReturnValue(true);
    mockFcmService.sendPush.mockResolvedValue({
      successCount: 1,
      failureCount: 1,
      unregisteredTokens: ['fcm_token_stale'],
    });
    const deleteSpy = jest.spyOn(TenantDeviceTokenRepository.prototype, 'delete').mockResolvedValue({ id: 'dt_2' } as any);
    jest.spyOn(TenantNotificationRepository.prototype, 'create').mockResolvedValue({ id: 'n-1' } as any);

    const result = await service.sendPushNotification(tenantId, userId, 'T', 'B');

    expect(result.sent).toBe(1);
    expect(deleteSpy).toHaveBeenCalledWith('dt_2');
  });

  it('should keep the log-only fallback when FCM is not configured', async () => {
    const tenantId = 'tenant-123';
    const userId = 'user-123';
    const mockTokens = [
      { id: 'dt_1', token: 'fcm_token_123', deviceType: 'android', userId, createdAt: new Date().toISOString() },
    ];
    jest.spyOn(TenantDeviceTokenRepository.prototype, 'findMany').mockResolvedValue(mockTokens as any);
    mockFcmService.isAvailable.mockReturnValue(false);

    const result = await service.sendPushNotification(tenantId, userId, 'New Order Placed', 'Order body');

    expect(result.sent).toBe(1);
    expect(mockFcmService.sendPush).not.toHaveBeenCalled();
    expect(TenantNotificationRepository.prototype.create).not.toHaveBeenCalled();
  });
});
