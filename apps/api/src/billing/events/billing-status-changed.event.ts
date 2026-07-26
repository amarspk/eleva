/**
 * DOC-009 §8.2 — Domain event emitted when a Stripe webhook
 * causes a subscription or tenant status transition.
 *
 * Consumed by BillingNotificationListener which routes the event
 * to the appropriate notification channels via BullMQ.
 * BillingService has zero knowledge of notification implementation.
 */
export class BillingStatusChangedEvent {
  constructor(
    public readonly tenantId: string,
    public readonly previousStatus: string,
    public readonly newStatus: string,
    public readonly eventType: string,
    public readonly eventId: string,
    public readonly timestamp: Date,
  ) {}
}
