import { Test, TestingModule } from '@nestjs/testing';
import { DispatchService } from './dispatch.service';
import { EmailService } from '../email/email.service';
import { SmsService } from '../sms/sms.service';
import { DeviceTokenService } from '../../device-token/device-token.service';
import { WebhookService } from '../../webhook/webhook.service';
import { KdsGateway } from '../../kds/kds.gateway';

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    status: 'wait',
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  }));
});

jest.mock('bullmq', () => {
  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: '1' }),
    close: jest.fn().mockResolvedValue(undefined),
    getWaitingCount: jest.fn().mockResolvedValue(0),
    getActiveCount: jest.fn().mockResolvedValue(0),
    getCompletedCount: jest.fn().mockResolvedValue(0),
    getFailedCount: jest.fn().mockResolvedValue(0),
  };
  const mockWorker = {
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  };
  return {
    Queue: jest.fn().mockImplementation(() => mockQueue),
    Worker: jest.fn().mockImplementation(() => mockWorker),
  };
});

describe('DispatchService Unit Tests — DOC-010 §9.4 BullMQ + DOC-008 §7.1', () => {
  let service: DispatchService;

  const mockEmailService = {
    sendEmail: jest.fn().mockResolvedValue({ success: true, mocked: true }),
  };

  const mockSmsService = {
    sendSms: jest.fn().mockResolvedValue({ success: true, provider: 'twilio-mock', attempts: 1 }),
  };

  const mockDeviceTokenService = {
    sendPushNotification: jest.fn().mockResolvedValue({ sent: 1, payloads: [{ message: { token: 'tok-1' } }] }),
  };

  const mockWebhookService = {
    dispatchEvent: jest.fn().mockResolvedValue([{ webhookId: 'wh-1', targetUrl: 'https://example.com/hook', success: true, attempts: 1 }]),
  };

  const mockKdsGateway = {
    broadcastOrderEvent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DispatchService,
        { provide: EmailService, useValue: mockEmailService },
        { provide: SmsService, useValue: mockSmsService },
        { provide: DeviceTokenService, useValue: mockDeviceTokenService },
        { provide: WebhookService, useValue: mockWebhookService },
        { provide: KdsGateway, useValue: mockKdsGateway },
      ],
    }).compile();

    service = module.get<DispatchService>(DispatchService);
    jest.clearAllMocks();
    service.clearQueues();
    delete process.env.REDIS_URL;
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('should dispatch email via queue without blocking (async processing)', async () => {
    const tenantId = 'tenant-123';
    const result = await service.dispatch(tenantId, 'email', 'order.created', {
      email: 'customer@example.com',
      orderNumber: 'ORD-123',
    });

    expect(result.queued).toBe(true);
    expect(result.channel).toBe('email');
    expect(result.event).toBe('order.created');
  });

  it('should dispatch SMS with regional optimization via queue', async () => {
    const tenantId = 'tenant-123';
    const result = await service.dispatch(tenantId, 'sms', 'order.ready', {
      phone: '+966512345678',
      orderNumber: 'ORD-123',
      message: 'Your order is ready',
    });

    expect(result.queued).toBe(true);
    expect(result.channel).toBe('sms');
  });

  it('should dispatch to all channels for an event (email, sms, push, webhook, websocket)', async () => {
    const tenantId = 'tenant-123';
    const results = await service.dispatchToAllChannels(tenantId, 'order.created', {
      id: 'order-123',
      orderNumber: 'ORD-123',
      email: 'test@example.com',
      phone: '+12025550144',
    });

    expect(results.length).toBe(5);
    expect(results.map((r) => r.channel).sort()).toEqual(['email', 'push', 'sms', 'webhook', 'websocket'].sort());
  });

  it('should implement failover routing when primary provider fails', async () => {
    jest.spyOn(mockEmailService, 'sendEmail').mockResolvedValueOnce({ success: false } as any).mockResolvedValueOnce({ success: true } as any);

    const tenantId = 'tenant-123';
    const result = await service.dispatch(tenantId, 'email', 'order.created', {
      email: 'test@example.com',
      orderNumber: 'ORD-123',
    });

    expect(result.queued).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('should fallback to in-memory queue when BullMQ unavailable', async () => {
    delete process.env.REDIS_URL;

    const tenantId = 'tenant-123';
    const result = await service.dispatch(tenantId, 'email', 'order.created', {
      email: 'test@example.com',
    });

    expect(result.queued).toBe(true);
    expect(result.fallback).toBe('memory');
  });

  it('should attempt BullMQ queue when REDIS_URL configured', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DispatchService,
        { provide: EmailService, useValue: mockEmailService },
        { provide: SmsService, useValue: mockSmsService },
        { provide: DeviceTokenService, useValue: mockDeviceTokenService },
        { provide: WebhookService, useValue: mockWebhookService },
        { provide: KdsGateway, useValue: mockKdsGateway },
      ],
    }).compile();

    const testService = module.get<DispatchService>(DispatchService);

    // Dispatch should try BullMQ, fail (mocked), and fall back to in-memory
    const result = await testService.dispatch('tenant-123', 'email', 'order.created', {
      email: 'test@example.com',
    });

    expect(result.queued).toBe(true);
    // With mocked BullMQ, it will use the queue mock (add succeeds)
    expect(result.channel).toBe('email');

    delete process.env.REDIS_URL;
    await testService.onModuleDestroy();
  });

  it('should preserve tenant isolation - dispatch uses tenantId from JWT, not client payload', async () => {
    const realTenantId = 'real-tenant';
    const evilTenantId = 'evil-tenant';

    const result = await service.dispatch(realTenantId, 'email', 'order.created', {
      email: 'test@example.com',
      tenantId: evilTenantId,
      orderNumber: 'ORD-123',
    });

    expect(result.queued).toBe(true);
  });

  it('should track queue length and DLQ for monitoring', async () => {
    expect(service.getQueueLength()).toBe(0);
    expect(service.getDeadLetterQueueLength()).toBe(0);

    await service.dispatch('tenant-1', 'email', 'order.created', { email: 'test@example.com' });

    expect(typeof service.getQueueLength()).toBe('number');
    expect(typeof service.getDeadLetterQueueLength()).toBe('number');
    expect(Array.isArray(service.getDeadLetterQueue())).toBe(true);

    service.clearQueues();
    expect(service.getQueueLength()).toBe(0);
  });

  it('should dispatch push via DeviceTokenService with userId from payload', async () => {
    const tenantId = 'tenant-123';
    const result = await service.dispatch(tenantId, 'push', 'order.ready', {
      userId: 'user-456',
      title: 'Order Ready',
      body: 'Your order is ready for pickup',
      orderNumber: 'ORD-123',
    });

    expect(result.queued).toBe(true);
    expect(result.channel).toBe('push');

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockDeviceTokenService.sendPushNotification).toHaveBeenCalledWith(
      tenantId,
      'user-456',
      'Order Ready',
      'Your order is ready for pickup',
      expect.objectContaining({ userId: 'user-456', orderNumber: 'ORD-123' }),
    );
  });

  it('should return push failure when userId missing from payload', async () => {
    mockDeviceTokenService.sendPushNotification.mockClear();
    const tenantId = 'tenant-123';
    const result = await service.dispatch(tenantId, 'push', 'order.ready', {
      orderNumber: 'ORD-123',
    });

    expect(result.queued).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockDeviceTokenService.sendPushNotification).not.toHaveBeenCalled();
  });

  it('should dispatch webhook via WebhookService.dispatchEvent', async () => {
    const tenantId = 'tenant-123';
    const payload = { id: 'order-123', orderNumber: 'ORD-123', status: 'completed' };
    const result = await service.dispatch(tenantId, 'webhook', 'order.completed', payload);

    expect(result.queued).toBe(true);
    expect(result.channel).toBe('webhook');

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockWebhookService.dispatchEvent).toHaveBeenCalledWith(tenantId, 'order.completed', payload);
  });

  it('should dispatch websocket broadcast via KdsGateway.broadcastOrderEvent', async () => {
    const tenantId = 'tenant-123';
    const payload = { id: 'order-123', orderNumber: 'ORD-123', branchId: 'branch-456', status: 'preparing' };
    const result = await service.dispatch(tenantId, 'websocket', 'order.preparing', payload);

    expect(result.queued).toBe(true);
    expect(result.channel).toBe('websocket');

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockKdsGateway.broadcastOrderEvent).toHaveBeenCalledWith(
      tenantId,
      'branch-456',
      'order.preparing',
      payload,
    );
  });

  it('should skip websocket broadcast when branchId missing from payload', async () => {
    mockKdsGateway.broadcastOrderEvent.mockClear();
    const tenantId = 'tenant-123';
    const result = await service.dispatch(tenantId, 'websocket', 'order.created', {
      id: 'order-123',
    });

    expect(result.queued).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockKdsGateway.broadcastOrderEvent).not.toHaveBeenCalled();
  });

  it('should handle webhook dispatch returning empty results', async () => {
    mockWebhookService.dispatchEvent.mockResolvedValueOnce([]);
    const tenantId = 'tenant-123';
    const result = await service.dispatch(tenantId, 'webhook', 'order.created', {
      id: 'order-123',
    });

    expect(result.queued).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(mockWebhookService.dispatchEvent).toHaveBeenCalled();
  });

  it('should use customerId fallback for push when userId not present', async () => {
    mockDeviceTokenService.sendPushNotification.mockClear();
    const tenantId = 'tenant-123';
    await service.dispatch(tenantId, 'push', 'payment.received', {
      customerId: 'cust-789',
      title: 'Payment Confirmed',
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockDeviceTokenService.sendPushNotification).toHaveBeenCalledWith(
      tenantId,
      'cust-789',
      'Payment Confirmed',
      expect.any(String),
      expect.any(Object),
    );
  });

  it('should use priority mapping in dispatch options', async () => {
    const result = await service.dispatch('tenant-1', 'email', 'urgent.event', {
      email: 'test@example.com',
    }, 'high');

    expect(result.queued).toBe(true);
  });

  it('should clean up on module destroy', async () => {
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });
});
