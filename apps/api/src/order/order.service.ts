import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException, Inject, Optional } from '@nestjs/common';
import { CreateOrderRequestDto } from './dto/create-order-request.dto';
import { UpdateOrderStatusRequestDto } from './dto/update-order-status-request.dto';
import { OrderStatus } from '@zayjar/types';
import {
  TenantOrderRepository,
  TenantBranchRepository,
  TenantProductRepository,
  TenantProductSizeRepository,
  TenantAddonItemRepository,
  TenantInvoiceRepository,
  TenantRestaurantRepository,
  TenantKitchenQueueRepository,
  prisma,
} from '@zayjar/db';
import { KdsGateway } from '../kds/kds.gateway';
import { WebhookService } from '../webhook/webhook.service';
import { EmailService } from '../notification/email/email.service';
import { SmsService } from '../notification/sms/sms.service';

@Injectable()
export class OrderService {
  private readonly logger = new Logger('OrderService');

  private readonly orderRepository = new TenantOrderRepository();
  private readonly branchRepository = new TenantBranchRepository();
  private readonly productRepository = new TenantProductRepository();
  private readonly sizeRepository = new TenantProductSizeRepository();
  private readonly addonItemRepository = new TenantAddonItemRepository();
  private readonly invoiceRepository = new TenantInvoiceRepository();
  private readonly restaurantRepository = new TenantRestaurantRepository();
  private readonly kitchenQueueRepository = new TenantKitchenQueueRepository();

  constructor(
    @Optional() @Inject(KdsGateway) private readonly kdsGateway?: KdsGateway,
    @Optional() @Inject(WebhookService) private readonly webhookService?: WebhookService,
    @Optional() @Inject(EmailService) private readonly emailService?: EmailService,
    @Optional() @Inject(SmsService) private readonly smsService?: SmsService,
  ) {}

  /**
   * Resolves canonical event name from OrderStatus
   */
  private mapStatusToEvent(status: OrderStatus): string | null {
    const mapping: Record<OrderStatus, string> = {
      [OrderStatus.DRAFT]: 'order.created',
      [OrderStatus.PENDING]: 'order.created',
      [OrderStatus.ACCEPTED]: 'order.accepted',
      [OrderStatus.PREPARING]: 'order.preparing',
      [OrderStatus.READY]: 'order.ready',
      [OrderStatus.COMPLETED]: 'order.completed',
      [OrderStatus.CANCELLED]: 'order.cancelled',
    };
    return mapping[status] || null;
  }

  /**
   * Centralized broadcast helper - preserves tenant isolation
   * Uses tenantId and branchId from database order record (server-resolved), never from client
   */
  private emitKdsEvent(tenantId: string, branchId: string, eventName: string, order: Record<string, unknown>): void {
    try {
      if (!this.kdsGateway) {
        this.logger.debug(`KdsGateway not injected, skipping broadcast for ${eventName}`);
      } else {
        if (!tenantId || !branchId) {
          this.logger.warn(`Cannot broadcast ${eventName}: missing tenantId/branchId`);
        } else {
          this.kdsGateway.broadcastOrderEvent(tenantId, branchId, eventName, order);
        }
      }

      // Also dispatch outbound webhook per DOC-008 7.5 (fire-and-forget)
      if (this.webhookService) {
        // Don't await to avoid blocking order transaction
        this.webhookService.dispatchEvent(tenantId, eventName, order).catch((err: Error) => {
          this.logger.warn(`Webhook dispatch failed for ${eventName}: ${err.message}`);
        });
      }
    } catch (err) {
      this.logger.error(`Failed to broadcast KDS event ${eventName}: ${(err as Error).message}`);
      // Do not fail order operation if broadcast fails
    }
  }

  /**
   * Orchestrates a secure checkout transaction.
   * Maps exactly to the transactional architecture requirements in TSK-2.0.
   */
  async createOrder(dto: CreateOrderRequestDto, userTenantId: string): Promise<Record<string, unknown>> {
    this.logger.log(`Initiating checkout transaction for tenant: [${userTenantId}]`);

    // 1. Validate branch ownership and resolve parameters
    const branch = await this.branchRepository.findById(dto.branchId);
    if (!branch) {
      throw new NotFoundException(`The selected branch with ID [${dto.branchId}] was not found.`);
    }

    // Resolve the parent restaurant brand to extract tax settings safely
    const restaurant = await this.restaurantRepository.findById(branch.restaurantId);
    if (!restaurant) {
      throw new NotFoundException(`The parent restaurant brand was not found under this tenant context.`);
    }

    let subtotal = 0;
    const orderItemsToCreate: Array<Record<string, unknown>> = [];

    // 2. Validate products and calculate totals strictly using database values
    for (const item of dto.items) {
      const product = await this.productRepository.findById(item.productId);
      if (!product || !product.isAvailable) {
        throw new NotFoundException(`Product with ID [${item.productId}] is unavailable or missing.`);
      }

      let unitPrice = Number(product.basePrice);

      // A. Evaluate sizing adjustments
      if (item.sizeId) {
        const size = await this.sizeRepository.findMany({ id: item.sizeId, productId: product.id });
        if (size.length === 0) {
          throw new BadRequestException(`Sizing modifier [${item.sizeId}] is invalid for this product.`);
        }
        unitPrice += Number(size[0].priceAdjustment);
      }

      let lineAddonsTotal = 0;
      const addonsToCreate: Array<Record<string, unknown>> = [];

      // B. Evaluate addons and choice selections
      if (item.addons && item.addons.length > 0) {
        for (const addonSelection of item.addons) {
          const addonItem = await this.addonItemRepository.findMany({ id: addonSelection.addonItemId });
          if (addonItem.length === 0 || !addonItem[0].isAvailable) {
            throw new BadRequestException(`Selected addon [${addonSelection.addonItemId}] is unavailable.`);
          }
          lineAddonsTotal += Number(addonItem[0].price);
          addonsToCreate.push({
            tenantId: userTenantId,
            addonItemId: addonItem[0].id,
            price: addonItem[0].price,
          });
        }
      }

      const totalLinePrice = (unitPrice + lineAddonsTotal) * item.quantity;
      subtotal += totalLinePrice;

      orderItemsToCreate.push({
        tenantId: userTenantId,
        productId: product.id,
        sizeId: item.sizeId || null,
        variantId: item.variantId || null,
        quantity: item.quantity,
        unitPrice,
        totalPrice: totalLinePrice,
        cookingStatus: 'PENDING',
        orderItemAddons: {
          create: addonsToCreate,
        },
      });
    }

    // 3. Compute totals on the server
    const taxRate = Number(restaurant.taxPercentage || 0.00) / 100;
    const taxAmount = Number((subtotal * taxRate).toFixed(2));
    const discountAmount = 0.00; // Placeholders for discount engines
    const total = Number((subtotal + taxAmount - discountAmount).toFixed(2));

    const orderNumber = `ORD-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

    // 4. Execute atomic database transaction
    const order = await prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          tenantId: userTenantId,
          branchId: dto.branchId,
          tableId: dto.tableId || null,
          orderNumber,
          type: dto.type,
          status: 'PENDING', // Awaiting payment/dispatch confirmation
          subtotal,
          taxAmount,
          discountAmount,
          total,
          specialNotes: dto.specialNotes || null,
          orderItems: {
            create: orderItemsToCreate,
          },
        },
        include: {
          orderItems: {
            include: {
              orderItemAddons: true,
            },
          },
        },
      });

      // Create kitchen_queues entry for KDS ticket tracking
      const ticketNumber = orderNumber.slice(-3);
      await tx.kitchenQueue.create({
        data: {
          tenantId: userTenantId,
          branchId: dto.branchId,
          orderId: createdOrder.id,
          ticketNumber,
          priority: 'NORMAL',
        },
      });

      this.logger.log(`Order checkout created atomically inside database. Reference: [${orderNumber}]`);
      return createdOrder;
    });

    // ==========================================
    // REAL-TIME KDS BROADCAST: ticket.created (canonical)
    // ==========================================
    if (this.kdsGateway && order.orderItems) {
      const ticketPayload = {
        ticketId: order.id,
        ticketNumber: orderNumber.slice(-3),
        priority: 'NORMAL',
        items: order.orderItems.map((item) => ({
          orderItemId: item.id,
          name: item.product?.name || 'Unknown Product',
          quantity: item.quantity,
          size: item.size?.name || null,
          addons: item.orderItemAddons
            ? item.orderItemAddons.map((a) => a.addonItem?.name).filter(Boolean)
            : [],
          cookingStatus: item.cookingStatus,
        })),
      };
      this.kdsGateway.emitTicketCreated(userTenantId, dto.branchId, ticketPayload);
    }

    // Legacy alias: order.created for backward compatibility
    this.emitKdsEvent(userTenantId, dto.branchId, 'order.created', order);

    return order;
  }

  /**
   * Safe lookup by id.
   */
  async getOrder(id: string): Promise<Record<string, unknown>> {
    const order = await this.orderRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`Order with ID [${id}] was not found.`);
    }
    return order;
  }

  /**
   * Safe listing scoped to tenant.
   */
  async getOrders(branchId?: string): Promise<Array<Record<string, unknown>>> {
    const where: Record<string, unknown> = {};
    if (branchId) {
      where.branchId = branchId;
    }
    return this.orderRepository.findMany(where);
  }

  /**
   * Enforces State-Machine validations during order status mutations.
   * Automatically generates billing invoices upon successful completion.
   * Broadcasts KDS events automatically whenever status changes.
   */
  async updateOrderStatus(id: string, dto: UpdateOrderStatusRequestDto): Promise<Record<string, unknown>> {
    const order = await this.orderRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`Order with ID [${id}] was not found.`);
    }

    this.validateStateTransition(order.status as OrderStatus, dto.status);

    // Save status update
    const updatedOrder = await this.orderRepository.update(id, {
      status: dto.status,
    });

    // ==========================================
    // INVOICING TRIGGER UPON COMPLETION
    // ==========================================
    if (dto.status === OrderStatus.COMPLETED) {
      await this.generateInvoice(updatedOrder);
    }

    // ==========================================
    // REAL-TIME KDS BROADCAST for status change
    // ==========================================
    const eventName = this.mapStatusToEvent(dto.status);
    if (eventName) {
      this.emitKdsEvent(updatedOrder.tenantId, updatedOrder.branchId, eventName, updatedOrder);
    }

    // Transactional SMS notification for order status updates per DOC-008 7.3
    if (dto.status === OrderStatus.READY && this.smsService) {
      // In real system, would fetch customer phone from order.customerId
      // For now, use mock phone number if available in order
      const customerPhone = (updatedOrder as Record<string, unknown>).customerPhone as string || '+12025550144';
      this.smsService
        .sendOrderStatusSms(customerPhone, updatedOrder.orderNumber, dto.status, updatedOrder.tenantId)
        .catch((err) => {
          this.logger.warn(`Failed to send SMS for order [${updatedOrder.id}] status [${dto.status}]: ${(err as Error).message}`);
        });
    }

    return updatedOrder;
  }

  /**
   * Safe cancellation.
   */
  async cancelOrder(id: string): Promise<Record<string, unknown>> {
    const order = await this.orderRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`Order with ID [${id}] was not found.`);
    }

    if (order.status === OrderStatus.COMPLETED) {
      throw new ConflictException('Completed orders cannot be cancelled.');
    }

    const cancelledOrder = await this.orderRepository.update(id, {
      status: OrderStatus.CANCELLED,
    });

    // Broadcast cancelled event
    this.emitKdsEvent(cancelledOrder.tenantId, cancelledOrder.branchId, 'order.cancelled', cancelledOrder);

    return cancelledOrder;
  }

  /**
   * Strict State Machine Transition Evaluator.
   */
  private validateStateTransition(current: OrderStatus, next: OrderStatus): void {
    const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
      DRAFT: [OrderStatus.PENDING, OrderStatus.CANCELLED],
      PENDING: [OrderStatus.ACCEPTED, OrderStatus.CANCELLED],
      ACCEPTED: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
      PREPARING: [OrderStatus.READY, OrderStatus.CANCELLED],
      READY: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
      COMPLETED: [], // Terminal State
      CANCELLED: [], // Terminal State
    };

    const routes = allowedTransitions[current] || [];
    if (!routes.includes(next)) {
      throw new BadRequestException(`Forbidden transition: Cannot move order from [${current}] directly to [${next}].`);
    }
  }

  /**
   * Safely generates an accounting invoice and dispatches email receipt per DOC-008 7.2
   */
  private async generateInvoice(order: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.logger.log(`Order status marked as completed. Generating billing invoice record...`);

    const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const pdfUrl = `https://cdn.zayjar.com/invoices/${invoiceNumber}.pdf`;

    const invoice = await this.invoiceRepository.create({
      tenantId: order.tenantId,
      orderId: order.id,
      invoiceNumber,
      pdfUrl,
    });

    // Dispatch invoice email receipt (fire-and-forget)
    if (this.emailService) {
      this.emailService
        .sendInvoiceEmail('customer@example.com', {
          invoiceNumber,
          orderNumber: order.orderNumber,
          customerName: 'Valued Customer',
          branchName: order.branchId,
          subtotal: order.subtotal,
          taxAmount: order.taxAmount,
          total: order.total,
          pdfUrl,
          companyName: 'Zayjar Restaurant',
        })
        .catch((err) => {
          this.logger.warn(`Failed to send invoice email for [${invoiceNumber}]: ${(err as Error).message}`);
        });
    }

    return invoice;
  }
}
