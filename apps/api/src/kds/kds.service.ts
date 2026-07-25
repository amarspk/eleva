import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { CookingStatus, OrderStatus } from '@zayjar/types';
import {
  TenantOrderRepository,
  TenantOrderItemRepository,
  TenantBranchRepository,
  TenantProductRepository,
  TenantProductSizeRepository,
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

  constructor(private readonly kdsGateway?: KdsGateway) {}

  /**
   * Returns active kitchen tickets for a branch.
   * Active = orders in ACCEPTED, PREPARING, READY, PENDING (kitchen queue)
   * Preserves tenant isolation via dbTenantContext and branch validation.
   */
  async getTickets(branchId: string, tenantId: string) {
    this.logger.log(`Fetching KDS tickets for tenant [${tenantId}] branch [${branchId}]`);

    // Validate branch ownership within tenant context
    const branch = await dbTenantContext.run({ tenantId }, async () => {
      return this.branchRepository.findById(branchId);
    });

    if (!branch) {
      throw new NotFoundException(`Branch with ID [${branchId}] not found or inaccessible under tenant context.`);
    }

    // Fetch active orders for branch within tenant context
    // Active statuses: PENDING, ACCEPTED, PREPARING, READY
    const activeStatuses = [
      OrderStatus.PENDING,
      OrderStatus.ACCEPTED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
    ];

    const orders = await dbTenantContext.run({ tenantId }, async () => {
      return prisma.order.findMany({
        where: {
          tenantId,
          branchId,
          status: { in: activeStatuses },
        },
        orderBy: { createdAt: 'asc' },
        include: {
          orderItems: {
            include: {
              product: true,
              size: true,
              orderItemAddons: {
                include: {
                  addonItem: true,
                },
              },
            },
          },
        },
      });
    });

    const now = new Date();

    // Transform to ticket format
    const tickets = orders.map((order: any) => {
      const createdAt = new Date(order.createdAt);
      const elapsedMs = now.getTime() - createdAt.getTime();
      const elapsedMinutes = Math.floor(elapsedMs / 60000);

      // Priority escalation: if elapsed > 15 minutes or exceeds max preparationTime of items
      const maxPrepTime = Math.max(
        ...order.orderItems.map((oi: any) => oi.product?.preparationTime || 15),
        15,
      );
      const priority = elapsedMinutes > maxPrepTime ? 'RUSH' : 'NORMAL';

      // Ticket number: last 3-4 chars of orderNumber or incremental
      const ticketNumber = order.orderNumber
        ? order.orderNumber.split('-').pop() || order.orderNumber.slice(-3)
        : order.id.slice(-4);

      return {
        ticketId: order.id, // Using orderId as ticketId; could be kitchenQueue id
        orderId: order.id,
        ticketNumber,
        priority,
        elapsedMinutes,
        createdAt: order.createdAt,
        orderStatus: order.status,
        items: order.orderItems.map((item: any) => {
          const addons = item.orderItemAddons
            ? item.orderItemAddons.map((a: any) => a.addonItem?.name).filter(Boolean)
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
    });

    return tickets;
  }

  /**
   * Updates cooking status of a specific order item.
   * Validates state transitions and emits real-time event to KDS room.
   */
  async updateCookingStatus(orderItemId: string, status: CookingStatus, tenantId: string) {
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
        where: { id: (orderItem as any).orderId, tenantId },
        select: { id: true, branchId: true, tenantId: true },
      });
    });

    if (!parentOrder) {
      this.logger.warn(`Parent order not found for orderItem [${orderItemId}], skipping broadcast`);
    } else {
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

          // Also broadcast as order.item_updated for backward compatibility with KDS terminal example
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

  private validateCookingTransition(current: CookingStatus, next: CookingStatus) {
    const allowed: Record<CookingStatus, CookingStatus[]> = {
      [CookingStatus.PENDING]: [CookingStatus.PREPARING, CookingStatus.COOKED, CookingStatus.SERVED],
      [CookingStatus.PREPARING]: [CookingStatus.COOKED, CookingStatus.SERVED],
      [CookingStatus.COOKED]: [CookingStatus.SERVED],
      [CookingStatus.SERVED]: [], // terminal
    };

    const routes = allowed[current] || [];
    // Allow same status idempotency? Not, but permit if same
    if (current === next) {return;}

    if (!routes.includes(next)) {
      throw new BadRequestException(
        `Forbidden cooking transition: Cannot move from [${current}] to [${next}]. Allowed: [${routes.join(', ')}]`,
      );
    }
  }
}
