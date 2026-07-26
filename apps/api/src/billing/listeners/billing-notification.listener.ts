import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BillingStatusChangedEvent } from '../events/billing-status-changed.event';
import { DispatchService } from '../../notification/dispatch/dispatch.service';

/**
 * DOC-009 §8.2 — Domain Event Listener for Billing Status Changes
 *
 * Consumes BillingStatusChangedEvent domain events and routes
 * notifications through the existing BullMQ-backed DispatchService.
 * This keeps BillingService independent from notification channels.
 */
@Injectable()
export class BillingNotificationListener {
  private readonly logger = new Logger(BillingNotificationListener.name);

  constructor(private readonly dispatchService: DispatchService) {}

  @OnEvent('billing.status_changed')
  async handleStatusChanged(event: BillingStatusChangedEvent): Promise<void> {
    this.logger.log(
      `Processing billing status change: tenant [${event.tenantId}] ${event.previousStatus} → ${event.newStatus} (event: ${event.eventType})`,
    );

    const notificationType = this.mapStatusToNotificationType(event.newStatus, event.eventType);

    if (!notificationType) {
      this.logger.debug(`No notification required for status [${event.newStatus}] (event: ${event.eventType})`);
      return;
    }

    try {
      await this.dispatchService.dispatch(event.tenantId, 'email', notificationType, {
        tenantId: event.tenantId,
        previousStatus: event.previousStatus,
        newStatus: event.newStatus,
        eventType: event.eventType,
        timestamp: event.timestamp,
      });

      this.logger.log(
        `Dispatched [${notificationType}] notification for tenant [${event.tenantId}] status change to [${event.newStatus}]`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to dispatch [${notificationType}] notification for tenant [${event.tenantId}]: ${(err as Error).message}`,
      );
    }
  }

  private mapStatusToNotificationType(newStatus: string, eventType: string): string | null {
    switch (newStatus) {
      case 'PAST_DUE':
        return 'billing.grace_period_warning';
      case 'CANCELED':
        return 'billing.subscription_canceled';
      case 'UNPAID':
        return 'billing.payment_required';
      default:
        if (eventType === 'customer.subscription.trial_will_end') {
          return 'billing.trial_expiring';
        }
        return null;
    }
  }
}
