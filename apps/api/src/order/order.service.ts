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
import { DiscountService } from '../discount/discount.service';
import { InvoicePdfService } from '../invoice/invoice-pdf.service';
import { InvoiceStorageService } from '../invoice/invoice-storage.service';

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
    @Optional() @Inject(InvoicePdfService) private readonly invoicePdfService?: InvoicePdfService,
    @Optional() @Inject(InvoiceStorageService) private readonly invoiceStorageService?: InvoiceStorageService,
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

    // Preorder validation
    if (dto.isPreorder && dto.scheduledAt) {
      const sched = new Date(dto.scheduledAt);
      if (isNaN(sched.getTime()) || sched.getTime() <= Date.now() + 15*60*1000) {
        throw new BadRequestException('scheduledAt must be at least 15 minutes in the future');
      }
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
   * Phase 4 P0 — server-side branch-scope enforcement (defense in depth).
   * When the authenticated user carries branch assignments (CASHIER,
   * KITCHEN_STAFF, BRANCH_MANAGER), every order operation MUST be confined to
   * those branches. A client-supplied branchId is never trusted on its own:
   * it must be present in the user's own user_branches-derived claim.
   * Users without branch assignments (RESTAURANT_OWNER, PLATFORM_OWNER, or a
   * staff role that was never scoped) keep the canonical tenant-wide behavior.
   */
  private assertBranchAllowed(userBranches: string[] | undefined, branchId: string): void {
    if (userBranches && userBranches.length > 0 && !userBranches.includes(branchId)) {
      throw new ForbiddenException(
        `Access denied: you do not have permission to operate on branch [${branchId}].`,
      );
    }
  }

  /**
   * Orchestrates a secure checkout transaction.
   * Maps exactly to the transactional architecture requirements in TSK-2.0.
   */
  async createOrder(
    dto: CreateOrderRequestDto,
    userTenantId: string,
    userBranches?: string[],
  ): Promise<Record<string, unknown>> {
    this.logger.log(`Initiating checkout transaction for tenant: [${userTenantId}]`);

    // Phase 4 P0 — enforce the caller's branch scope BEFORE any lookup so a
    // branch-scoped staff user can never create an order against a foreign
    // branch, even if they somehow hold a checkout DTO for one.
    this.assertBranchAllowed(userBranches, dto.branchId);

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

    // 1b. Validate the table (AUDIT-007). `dto.tableId` was previously written
    // straight onto the order with no lookup at all — only `branchId` and the
    // products were checked. Runtime-proven before this fix: a checkout naming
    // a SOFT-DELETED table (and a table belonging to a DIFFERENT branch than
    // the one being ordered against) returned HTTP 201 and persisted the order
    // against that table. Soft-deleting a table is supposed to remove it from
    // service, so this is the bypass that made the new DELETE endpoint
    // incomplete.
    //
    // `tableRepository.findById` is tenant-scoped and filters `deletedAt IS
    // NULL`, so this rejects foreign, unknown and deleted tables uniformly.
    if (dto.tableId) {
      const table = await this.tableRepository.findById(dto.tableId);
      if (!table) {
        throw new NotFoundException(`The selected table with ID [${dto.tableId}] was not found.`);
      }
      if (table.branchId !== branch.id) {
        throw new BadRequestException('The selected table does not belong to the selected branch.');
      }
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

    // 3. Compute taxes on the server (discount is resolved atomically inside
    // the transaction — see step 4 — so usage increments with order creation).
    const taxRate = Number(restaurant.taxPercentage || 0.00) / 100;
    const taxAmount = Number((subtotal * taxRate).toFixed(2));

    const orderNumber = `ORD-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

    // 4. Execute atomic database transaction
    const order = await prisma.$transaction(async (tx) => {
      // Discount engine (Sprint 2 Task 4): resolve the optional discount code
      // inside the transaction. Validation failures abort the whole checkout
      // with a uniform message; a successful usage increment is atomic with the
      // order creation (no race on usageCount).
      const discountCode = dto.discountCode ? dto.discountCode.trim().toUpperCase() : null;
      let discountAmount = 0.00;
      let discountId: string | null = null;
      if (discountCode) {
        const discount = await tx.discount.findUnique({
          where: { tenantId_code: { tenantId: userTenantId, code: discountCode } },
        });
        const resolved = DiscountService.validateDiscount(discount, discountCode, subtotal);
        discountId = resolved.discountId;
        discountAmount = resolved.amount;
        await tx.discount.update({
          where: { id: discountId },
          data: { usageCount: { increment: 1 } },
        });
      }
      const total = Number((subtotal + taxAmount - discountAmount).toFixed(2));

      const createdOrder = await tx.order.create({
        data: {
          tenantId: userTenantId,
          branchId: dto.branchId,
          tableId: dto.tableId || null,
          orderNumber,
          type: dto.type,
          paymentMethod: dto.paymentMethod,
          status: 'PENDING', // Awaiting payment/dispatch confirmation
          subtotal,
          taxAmount,
          discountAmount,
          discountId,
          discountCode,
          total,
          specialNotes: dto.specialNotes || null,
      isPreorder: !!dto.isPreorder,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      preorderStatus: dto.isPreorder ? 'SCHEDULED' : null,
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

    // Phase 4 P0 — emit a cashier-focused new-order notification so the
    // cashier POS terminal can display an audible alert.
    if (this.kdsGateway) {
      try {
        this.kdsGateway.emitNotificationNewOrder(userTenantId, dto.branchId, {
          orderId: order.id,
          orderNumber: order.orderNumber,
          branchId: order.branchId,
          status: order.status,
          total: Number(order.total),
          taxAmount: Number(order.taxAmount),
          subtotal: Number(order.subtotal),
          type: order.type,
          createdAt: order.createdAt instanceof Date
            ? order.createdAt.toISOString()
            : String(order.createdAt),
          customerName: null,
          items: [],
        });
      } catch (err) {
        this.logger.error(`Failed to emit cashier new-order notification for order [${order.orderNumber}]: ${(err as Error).message}`);
      }
    }

    return order;
  }

  /**
   * Safe lookup by id.
   */
  async getOrder(id: string, userBranches?: string[]): Promise<Record<string, unknown>> {
    const order = await this.orderRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`Order with ID [${id}] was not found.`);
    }
    this.assertBranchAllowed(userBranches, order.branchId);
    return order;
  }

  /**
   * Safe listing scoped to tenant and (for branch-scoped staff) to the user's
   * assigned branches. An explicit client-supplied branchId is honored only
   * when it falls inside the caller's scope; otherwise it is rejected.
   */
  async getOrders(branchId?: string, userBranches?: string[]): Promise<Array<Record<string, unknown>>> {
    const where: Record<string, unknown> = {};

    // Phase 4 P0: branch-scoped users can only ever see orders from their
    // assigned branches. This closes the list endpoint, which the RBAC guard
    // cannot scope (no :id entity to resolve against).
    if (userBranches && userBranches.length > 0) {
      if (branchId) {
        this.assertBranchAllowed(userBranches, branchId);
        where.branchId = branchId;
      } else {
        where.branchId = { in: userBranches };
      }
    } else if (branchId) {
      where.branchId = branchId;
    }

    return this.orderRepository.findMany(where);
  }

  /**
   * Enforces State-Machine validations during order status mutations.
   * Automatically generates billing invoices upon successful completion.
   * Broadcasts KDS events automatically whenever status changes.
   */
  async updateOrderStatus(
    id: string,
    dto: UpdateOrderStatusRequestDto,
    userBranches?: string[],
  ): Promise<Record<string, unknown>> {
    const order = await this.orderRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`Order with ID [${id}] was not found.`);
    }

    // Phase 4 P0 — a branch-scoped staff user cannot mutate orders in other
    // branches even when they hold a valid order id.
    this.assertBranchAllowed(userBranches, order.branchId);

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
  async cancelOrder(id: string, userBranches?: string[]): Promise<Record<string, unknown>> {
    const order = await this.orderRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`Order with ID [${id}] was not found.`);
    }

    // Phase 4 P0 — branch-scoped staff cannot cancel orders in other branches.
    this.assertBranchAllowed(userBranches, order.branchId);

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
   * Generates a real accounting invoice with an actual PDF document (Sprint 2
   * Task 5 — replaces the fabricated CDN `pdfUrl`) and dispatches an email
   * receipt per DOC-008 7.2.
   *
   * The PDF is rendered by InvoicePdfService, persisted through
   * InvoiceStorageService (local filesystem or S3), and the real public URL is
   * stored on the Invoice record. Customer/branch/restaurant data is resolved
   * from the database; the email dispatch remains fire-and-forget.
   */
  private async generateInvoice(order: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.logger.log(`Order status marked as completed. Generating billing invoice record...`);

    const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const tenantId = order.tenantId as string;
    const orderId = order.id as string;

    // Resolve real display data for the invoice (customer + branch + restaurant).
    let customerName = 'Valued Customer';
    let branchName = (order.branchId as string) ?? 'Main Branch';
    let companyName = 'Zayjar Restaurant';
    try {
      if (order.customerId) {
        const customer = await prisma.customer.findUnique({
          where: { id: order.customerId as string },
          select: { firstName: true, lastName: true },
        });
        if (customer) {
          customerName = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Valued Customer';
        }
      }
      const branch = await prisma.branch.findUnique({
        where: { id: order.branchId as string },
        select: { name: true, restaurant: { select: { name: true } } },
      });
      if (branch) {
        branchName = branch.name;
        companyName = branch.restaurant?.name || companyName;
      }
    } catch (err) {
      this.logger.warn(`Invoice data resolution degraded (using defaults): ${(err as Error).message}`);
    }

    const pdfUrl = await this.renderAndStoreInvoicePdf({
      invoiceNumber,
      order,
      customerName,
      branchName,
      companyName,
    });

    const invoice = await this.invoiceRepository.create({
      tenantId,
      orderId,
      invoiceNumber,
      pdfUrl,
    });

    // Dispatch invoice email receipt (fire-and-forget)
    if (this.emailService) {
      this.emailService
        .sendInvoiceEmail('customer@example.com', {
          invoiceNumber,
          orderNumber: order.orderNumber as string,
          customerName,
          branchName,
          subtotal: order.subtotal as number,
          taxAmount: order.taxAmount as number,
          total: order.total as number,
          pdfUrl,
          companyName,
        })
        .catch((err) => {
          this.logger.warn(`Failed to send invoice email for [${invoiceNumber}]: ${(err as Error).message}`);
        });
    }

    return invoice;
  }

  /**
   * Renders the invoice PDF and persists it. Falls back to the previous
   * CDN-style URL only if the PDF pipeline is unavailable (e.g. the optional
   * services are not wired) — the production module always wires them.
   */
  private async renderAndStoreInvoicePdf(input: {
    invoiceNumber: string;
    order: Record<string, unknown>;
    customerName: string;
    branchName: string;
    companyName: string;
  }): Promise<string> {
    const { invoiceNumber, order, customerName, branchName, companyName } = input;
    if (this.invoicePdfService && this.invoiceStorageService) {
      try {
        const pdf = await this.invoicePdfService.generate({
          invoiceNumber,
          orderNumber: (order.orderNumber as string) ?? '',
          companyName,
          branchName,
          customerName,
          subtotal: Number(order.subtotal) || 0,
          taxAmount: Number(order.taxAmount) || 0,
          discountAmount: Number(order.discountAmount) || 0,
          total: Number(order.total) || 0,
          issuedAt: new Date(),
        });
        const stored = await this.invoiceStorageService.storePdf(
          order.tenantId as string,
          invoiceNumber,
          pdf,
        );
        return stored.url;
      } catch (err) {
        this.logger.warn(
          `Invoice PDF generation failed for [${invoiceNumber}], falling back to URL placeholder: ${(err as Error).message}`,
        );
      }
    }
    return `https://cdn.zayjar.com/invoices/${invoiceNumber}.pdf`;
  }
}
