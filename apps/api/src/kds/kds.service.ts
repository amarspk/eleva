import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { CookingStatus, OrderStatus } from '@zayjar/types';
import {
  TenantOrderRepository,
  TenantOrderItemRepository,
  TenantBranchRepository,
  TenantProductRepository,
  TenantProductSizeRepository,
  TenantKitchenQueueRepository,
  prisma,
  dbTenantContext,
} from '@zayjar/db';
import { KdsGateway } from './kds.gateway';

@Injectable()
export class KdsService {
  private readonly logger = new Logger(KdsService.name);

  private readonly orderRepository = new TenantOrderRepository();
  private readonly orderItemRepository = new TenantOrderItemRepository();
  private readonly branchRepository = new TenantBranchRepository();
  private readonly productRepository = new TenantProductRepository();
  private readonly sizeRepository = new TenantProductSizeRepository();
  private readonly kitchenQueueRepository = new TenantKitchenQueueRepository();

  constructor(private readonly kdsGateway?: KdsGateway) {}

  /**
   * Returns active kitchen tickets for a branch.
   * Source of truth: kitchen_queues table joined with orders and order items.
   * Computes priority server-side and pushes ticket.priority_changed when escalation occurs.
   */
  async getTickets(branchId: string, tenantId: string): Promise<Array<{
    ticketId: string;
    orderId: string;
    ticketNumber: string;
    priority: string;
    elapsedMinutes: number;
    createdAt: Date;
    orderStatus: string;
    items: Array<{
      orderItemId: string;
      name: string;
      quantity: number;
      size: string | null;
      addons: Array<string | null>;
      cookingStatus: string;
    }>;
  }>> {
    this.logger.log(`Fetching KDS tickets for tenant [${tenantId}] branch [${branchId}]`);

    // Validate branch ownership within tenant context
    const branch = await dbTenantContext.run({ tenantId }, async () => {
      return this.branchRepository.findById(branchId);
    });

    if (!branch) {
      throw new NotFoundException(`Branch with ID [${branchId}] not found or inaccessible under tenant context.`);
    }

    // Fetch active kitchen queue entries for branch within tenant context
    const activeStatuses = [
      OrderStatus.PENDING,
      OrderStatus.ACCEPTED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
    ];

    const kitchenQueues = await dbTenantContext.run({ tenantId }, async () => {
      return prisma.kitchenQueue.findMany({
        where: {
          tenantId,
          branchId,
          order: { status: { in: activeStatuses } },
        },
        orderBy: { order: { createdAt: 'asc' } },
        include: {
          order: {
            include: {
              orderItems: {
                include: {
                  product: true,
                  size: true,
                  orderItemAddons: {
                    include: { addonItem: true },
                  },
                },
              },
            },
          },
        },
      });
    });

    const now = new Date();

    // Transform to ticket format with server-side priority computation
    const tickets = await Promise.all(
      kitchenQueues.map(async (kq) => {
        const order = kq.order;
        const createdAt = new Date(order.createdAt);
        const elapsedMs = now.getTime() - createdAt.getTime();
        const elapsedMinutes = Math.floor(elapsedMs / 60000);

        // Server-side priority escalation: if elapsed > maxPrepTime of items
        const maxPrepTime = Math.max(
          ...order.orderItems.map((oi) => oi.product?.preparationTime || 15),
          15,
        );
        const computedPriority = elapsedMinutes > maxPrepTime ? 'RUSH' : 'NORMAL';

        // Push priority_changed event if priority escalated
        if (computedPriority === 'RUSH' && kq.priority !== 'RUSH') {
          try {
            await dbTenantContext.run({ tenantId }, async () => {
              await this.kitchenQueueRepository.update(kq.id, { priority: 'RUSH' });
            });

            if (this.kdsGateway) {
              this.kdsGateway.emitTicketPriorityChanged(
                tenantId,
                branchId,
                kq.id,
                kq.priority,
                'RUSH',
              );
            }
          } catch (err) {
            this.logger.error(`Failed to escalate priority for ticket [${kq.id}]: ${(err as Error).message}`);
          }
        }

        return {
          ticketId: kq.id,
          orderId: order.id,
          ticketNumber: kq.ticketNumber,
          priority: computedPriority,
          elapsedMinutes,
          createdAt: order.createdAt,
          orderStatus: order.status,
          items: order.orderItems.map((item) => {
            const addons = item.orderItemAddons
              ? item.orderItemAddons.map((a) => a.addonItem?.name).filter(Boolean)
              : [];

            return {
              orderItemId: item.id,
              name: item.product?.name || 'Unknown Product',
              quantity: item.quantity,
              size: item.size?.name || null,
              addons,
              cookingStatus: item.cookingStatus,
            };
          }),
        };
      }),
    );

    return tickets;
  }

  /**
   * Updates cooking status of a specific order item.
   * Validates state transitions, updates kitchen_queues timestamps, and emits real-time events.
   */
  async updateCookingStatus(orderItemId: string, status: CookingStatus, tenantId: string): Promise<{
    orderItemId: string;
    cookingStatus: string;
    updatedAt: string;
  }> {
    this.logger.log(`Updating cooking status for orderItem [${orderItemId}] to [${status}] under tenant [${tenantId}]`);

    // Validate cooking status enum
    if (!Object.values(CookingStatus).includes(status)) {
      throw new BadRequestException(`Invalid cooking status [${status}].`);
    }

    // Fetch orderItem within tenant context to enforce isolation
    const orderItem = await dbTenantContext.run({ tenantId }, async () => {
      return this.orderItemRepository.findById(orderItemId);
    });

    if (!orderItem) {
      throw new NotFoundException(`Order item with ID [${orderItemId}] not found.`);
    }

    // Validate state transition for cooking
    this.validateCookingTransition(orderItem.cookingStatus as CookingStatus, status);

    // Update cooking status
    const updatedItem = await dbTenantContext.run({ tenantId }, async () => {
      return this.orderItemRepository.update(orderItemId, {
        cookingStatus: status,
      });
    });

    // Fetch parent order to resolve branchId for broadcast (tenant-isolated)
    const parentOrder = await dbTenantContext.run({ tenantId }, async () => {
      return prisma.order.findFirst({
        where: { id: orderItem.orderId, tenantId },
        select: { id: true, branchId: true, tenantId: true },
      });
    });

    if (!parentOrder) {
      this.logger.warn(`Parent order not found for orderItem [${orderItemId}], skipping broadcast`);
    } else {
      // Update kitchen_queues timestamps based on cooking status transition
      await this.updateKitchenQueueTimestamps(parentOrder.id, status, tenantId);

      // Broadcast ticket.item_updated event to tenant+branch room
      try {
        if (this.kdsGateway) {
          this.kdsGateway.broadcastOrderEvent(
            parentOrder.tenantId,
            parentOrder.branchId,
            'ticket.item_updated',
            {
              orderId: parentOrder.id,
              orderItemId: updatedItem.id,
              cookingStatus: updatedItem.cookingStatus,
              updatedAt: new Date().toISOString(),
            },
          );

          // Legacy alias: order.item_updated for backward compatibility
          this.kdsGateway.broadcastOrderEvent(
            parentOrder.tenantId,
            parentOrder.branchId,
            'order.item_updated',
            {
              orderId: parentOrder.id,
              orderItemId: updatedItem.id,
              status,
              cookingStatus: updatedItem.cookingStatus,
            },
          );
        }
      } catch (err) {
        this.logger.error(`Failed to broadcast cooking status update: ${(err as Error).message}`);
      }
    }

    return {
      orderItemId: updatedItem.id,
      cookingStatus: updatedItem.cookingStatus,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Updates kitchen_queues timestamps when cooking status changes.
   * PREPARING -> sets startedCookingAt
   * COOKED/SERVED -> sets completedCookingAt
   */
  private async updateKitchenQueueTimestamps(
    orderId: string,
    status: CookingStatus,
    tenantId: string,
  ): Promise<void> {
    try {
      const kitchenQueue = await dbTenantContext.run({ tenantId }, async () => {
        return prisma.kitchenQueue.findFirst({
          where: { orderId, tenantId },
        });
      });

      if (!kitchenQueue) {
        this.logger.warn(`Kitchen queue not found for order [${orderId}], skipping timestamp update`);
        return;
      }

      const updateData: Record<string, unknown> = {};

      if (status === CookingStatus.PREPARING && !kitchenQueue.startedCookingAt) {
        updateData.startedCookingAt = new Date();
      }

      if (status === CookingStatus.COOKED || status === CookingStatus.SERVED) {
        updateData.completedCookingAt = new Date();
      }

      if (Object.keys(updateData).length > 0) {
        await dbTenantContext.run({ tenantId }, async () => {
          await this.kitchenQueueRepository.update(kitchenQueue.id, updateData);
        });
      }
    } catch (err) {
      this.logger.error(`Failed to update kitchen queue timestamps for order [${orderId}]: ${(err as Error).message}`);
    }
  }

  private validateCookingTransition(current: CookingStatus, next: CookingStatus): void {
    const allowed: Record<CookingStatus, CookingStatus[]> = {
      [CookingStatus.PENDING]: [CookingStatus.PREPARING, CookingStatus.COOKED, CookingStatus.SERVED],
      [CookingStatus.PREPARING]: [CookingStatus.COOKED, CookingStatus.SERVED],
      [CookingStatus.COOKED]: [CookingStatus.SERVED],
      [CookingStatus.SERVED]: [], // terminal
    };

    const routes = allowed[current] || [];
    if (current === next) { return; }

    if (!routes.includes(next)) {
      throw new BadRequestException(
        `Forbidden cooking transition: Cannot move from [${current}] to [${next}]. Allowed: [${routes.join(', ')}]`,
      );
    }
  }
}
