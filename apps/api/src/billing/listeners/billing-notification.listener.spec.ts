import { Test, TestingModule } from '@nestjs/testing';
import { BillingNotificationListener } from './billing-notification.listener';
import { DispatchService } from '../../notification/dispatch/dispatch.service';
import { BillingStatusChangedEvent } from '../events/billing-status-changed.event';

describe('BillingNotificationListener', () => {
  let listener: BillingNotificationListener;
  let dispatchService: jest.Mocked<DispatchService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingNotificationListener,
        {
          provide: DispatchService,
          useValue: {
            dispatch: jest.fn().mockResolvedValue({ queued: true, jobId: 'test-job', channel: 'email', event: 'test' }),
          },
        },
      ],
    }).compile();

    listener = module.get<BillingNotificationListener>(BillingNotificationListener);
    dispatchService = module.get(DispatchService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  describe('handleStatusChanged', () => {
    it('should dispatch email notification for PAST_DUE status', async () => {
      const event = new BillingStatusChangedEvent(
        'tenant-1',
        'ACTIVE',
        'PAST_DUE',
        'invoice.payment_failed',
        'evt-1',
        new Date(),
      );

      await listener.handleStatusChanged(event);

      expect(dispatchService.dispatch).toHaveBeenCalledWith(
        'tenant-1',
        'email',
        'billing.grace_period_warning',
        expect.objectContaining({ tenantId: 'tenant-1', newStatus: 'PAST_DUE' }),
      );
    });

    it('should dispatch email notification for CANCELED status', async () => {
      const event = new BillingStatusChangedEvent(
        'tenant-2',
        'ACTIVE',
        'CANCELED',
        'customer.subscription.deleted',
        'evt-2',
        new Date(),
      );

      await listener.handleStatusChanged(event);

      expect(dispatchService.dispatch).toHaveBeenCalledWith(
        'tenant-2',
        'email',
        'billing.subscription_canceled',
        expect.objectContaining({ newStatus: 'CANCELED' }),
      );
    });

    it('should dispatch email notification for trial_will_end event', async () => {
      const event = new BillingStatusChangedEvent(
        'tenant-3',
        'TRIALING',
        'TRIALING',
        'customer.subscription.trial_will_end',
        'evt-3',
        new Date(),
      );

      await listener.handleStatusChanged(event);

      expect(dispatchService.dispatch).toHaveBeenCalledWith(
        'tenant-3',
        'email',
        'billing.trial_expiring',
        expect.objectContaining({ eventType: 'customer.subscription.trial_will_end' }),
      );
    });

    it('should not dispatch for ACTIVE status', async () => {
      const event = new BillingStatusChangedEvent(
        'tenant-4',
        'PAST_DUE',
        'ACTIVE',
        'invoice.payment_succeeded',
        'evt-4',
        new Date(),
      );

      await listener.handleStatusChanged(event);

      expect(dispatchService.dispatch).not.toHaveBeenCalled();
    });

    it('should re-throw errors from dispatch', async () => {
      dispatchService.dispatch.mockRejectedValueOnce(new Error('Dispatch failed'));

      const event = new BillingStatusChangedEvent(
        'tenant-5',
        'ACTIVE',
        'PAST_DUE',
        'invoice.payment_failed',
        'evt-5',
        new Date(),
      );

      await expect(listener.handleStatusChanged(event)).rejects.toThrow('Dispatch failed');
    });
  });
});
