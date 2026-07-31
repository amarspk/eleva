import {
  Injectable, Logger, NotFoundException, BadRequestException, ConflictException, ForbiddenException, Inject, Optional } from '@nestjs/common';
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
  TenantTableRepository,
  prisma,
  dbTenantContext,
  Prisma,
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
  private readonly tableRepository = new TenantTableRepository();

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
   * Unauthenticated guest checkout for the QR Ordering Channel
   * (DOC-001 1.2, DOC-003 3.6.1, DOC-005 4.6).
   *
   * The qrCodeToken is the sole guest credential: it is verified against the
   * tables of the tenant resolved by TenantContextMiddleware, and the branch
   * and table bindings are then derived server-authoritatively from the
   * resolved table row — never from client-supplied fields. An explicit
   * client-side branch/table that conflicts with the token is rejected.
   * Unknown or mismatched tokens receive a uniform 404 (no existence oracle).
   *
   * After verification the call delegates to the exact same createOrder()
   * pipeline the authenticated staff checkout uses, so pricing, tax,
   * transaction atomicity and KDS broadcasting are identical across channels.
   */
  async createGuestOrder(dto: CreateOrderRequestDto, guestTenantId: string): Promise<Record<string, unknown>> {
    this.logger.log(`Initiating guest QR checkout for tenant: [${guestTenantId}]`);

    if (!guestTenantId) {
      throw new BadRequestException('Tenant context is required for guest checkout.');
    }

    return dbTenantContext.run({ tenantId: guestTenantId }, async () => {
      if (!dto.qrCodeToken || dto.qrCodeToken.trim().length === 0) {
        throw new BadRequestException('A valid qrCodeToken is required for guest checkout.');
      }

      const table = await this.tableRepository.findByQrCodeToken(dto.qrCodeToken);
      if (!table) {
        this.logger.warn('Guest checkout rejected: qrCodeToken did not resolve to a table under this tenant.');
        throw new NotFoundException('The scanned QR code could not be resolved.');
      }

      if (dto.branchId !== table.branchId) {
        throw new BadRequestException('The order target branch does not match the scanned table branch.');
      }
      if (dto.tableId && dto.tableId !== table.id) {
        throw new BadRequestException('The order target table does not match the scanned QR table.');
      }

      // Server-authoritative binding (DOC-005 4.6)
      dto.branchId = table.branchId;
      dto.tableId = table.id;

      // FIX 2026-07-30 (Runtime Defect R6 — guest-checkout gating parity):
      // DOC-001 1.10 — tenant UNPAID pauses guest ordering, CANCELED disables
      // core access. Previously enforced on public menu/table resolve only —
      // runtime-verified gap: checkout accepted orders under UNPAID/CANCELED.
      const tenant = await prisma.tenant.findUnique({
        where: { id: guestTenantId },
        select: { status: true },
      });
      if (tenant?.status === 'UNPAID' || tenant?.status === 'CANCELED') {
        this.logger.warn(`Guest checkout rejected: tenant status is [${tenant.status}].`);
        throw new ForbiddenException('Online ordering is temporarily unavailable for this restaurant.');
      }

      return this.createOrder(dto, guestTenantId);
    });
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
    const orderItemsToCreate: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] = [];

    // 2. Validate products and calculate totals strictly using database values
    for (const item of dto.items) {
      const product = await this.productRepository.findById(item.productId);
      if (!product || !product.isAvailable) {
        throw new NotFoundException(`Product with ID [${item.productId}] is unavailable or missing.`);
      }

      let unitPrice = Number(product.basePrice);

      // DEFECT-A fix (DOC-005 4.3, Condition C): a selected variant carries an
      // absolute price that replaces the base price entirely and takes
      // precedence over sizing adjustments. Variant ownership and stock are
      // validated strictly against database values.
      if (item.variantId) {
        const variant = await prisma.productVariant.findFirst({
          where: { id: item.variantId, productId: product.id },
        });
        if (!variant) {
          throw new BadRequestException(`Variant [${item.variantId}] is invalid for product [${item.productId}].`);
        }
        if (variant.stockQuantity <= 0) {
          throw new BadRequestException(`Variant [${item.variantId}] for product [${item.productId}] is out of stock.`);
        }
        unitPrice = Number(variant.price);
      } else if (item.sizeId) {
        // A. Evaluate sizing adjustments (only when no variant is selected)
        const size = await this.sizeRepository.findMany({ id: item.sizeId, productId: product.id });
        if (size.length === 0) {
          throw new BadRequestException(`Sizing modifier [${item.sizeId}] is invalid for this product.`);
        }
        unitPrice += Number(size[0].priceAdjustment);
      }

      let lineAddonsTotal = 0;
      const addonsToCreate: Prisma.OrderItemAddonUncheckedCreateWithoutOrderItemInput[] = [];

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
    // DEFECT-B fix (DOC-005): the atomic create above returns only
    // orderItems.orderItemAddons, whose raw rows carry no product/size/addon
    // names — broadcasting them produced "Unknown Product" lines on live KDS
    // tickets. Display names are resolved through a dedicated post-transaction
    // read so the checkout HTTP response payload remains byte-identical.
    if (this.kdsGateway) {
      try {
        const itemsWithNames = await prisma.orderItem.findMany({
          where: { orderId: order.id },
          select: {
            id: true,
            quantity: true,
            cookingStatus: true,
            product: { select: { name: true } },
            size: { select: { name: true } },
            orderItemAddons: { select: { addonItem: { select: { name: true } } } },
          },
        });

        const ticketPayload = {
          ticketId: order.id,
          ticketNumber: orderNumber.slice(-3),
          priority: 'NORMAL',
          items: itemsWithNames.map((item) => ({
            orderItemId: item.id,
            name: item.product?.name || 'Unknown Product',
            quantity: item.quantity,
            size: item.size?.name || null,
            addons: item.orderItemAddons
              .map((addon) => addon.addonItem?.name)
              .filter(Boolean),
            cookingStatus: item.cookingStatus,
          })),
        };
        this.kdsGateway.emitTicketCreated(userTenantId, dto.branchId, ticketPayload);
      } catch (err) {
        this.logger.error(`Failed to emit ticket.created for order [${orderNumber}]: ${(err as Error).message}`);
        // Broadcasting is best-effort and must never fail a completed checkout.
      }
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
          orderNumber: order.orderNumber as string,
          customerName: 'Valued Customer',
          branchName: order.branchId as string,
          subtotal: order.subtotal as number,
          taxAmount: order.taxAmount as number,
          total: order.total as number,
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
