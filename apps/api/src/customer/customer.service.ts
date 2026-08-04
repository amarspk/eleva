import { Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { CreateCustomerRequestDto } from './dto/create-customer-request.dto';
import { UpdateCustomerRequestDto } from './dto/update-customer-request.dto';
import { TenantCustomerRepository, Customer, prisma } from '@zayjar/db';

/** Uniform response for a soft-delete mutation. */
export interface SoftDeleteResult {
  id: string;
  deleted: boolean;
}

/** Uniform response for a restore mutation. */
export interface RestoreResult {
  id: string;
  restored: true;
}

/**
 * Order states that still need the customer record operationally.
 * Deleting a customer mid-service would strand their in-flight order.
 */
const ACTIVE_ORDER_STATUSES = ['DRAFT', 'PENDING', 'ACCEPTED', 'PREPARING', 'READY'] as const;

@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);
  private readonly customerRepository = new TenantCustomerRepository();

  /**
   * Registers a new customer profile under tenant context.
   * Public registration – tenantId resolved from authenticated context / middleware, never from client payload.
   */
  async createCustomer(dto: CreateCustomerRequestDto): Promise<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    loyaltyPoints: number;
    createdAt: Date;
  }> {
    this.logger.log(`Registering customer profile: [${dto.email}]`);

    // Check for existing email within tenant scope (fail-safe via repository scoping)
    const existing = await this.customerRepository.findMany({ email: dto.email });
    if (existing.length > 0) {
      throw new ConflictException(`Customer with email [${dto.email}] already exists under this tenant context.`);
    }

    // Create customer with default loyaltyPoints = 0
    const customer = await this.customerRepository.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phoneNumber: dto.phoneNumber || null,
      loyaltyPoints: 0,
    });

    this.logger.log(`Customer registered successfully with ID [${customer.id}] under tenant context`);

    // Return minimal public response per DOC-003 3.7.1
    return {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      loyaltyPoints: customer.loyaltyPoints || 0,
      createdAt: customer.createdAt,
    };
  }

  /**
   * Lists the tenant's customers.
   *
   * See AUDIT-014 DEFECT-J: `includeDeleted` makes the restore endpoint
   * reachable by letting the archive view list soft-deleted rows.
   */
  async getCustomers(includeDeleted = false): Promise<Customer[]> {
    return this.customerRepository.findMany(includeDeleted ? { deletedAt: undefined } : {});
  }

  /**
   * Single customer read, tenant-scoped. Soft-deleted rows are hidden.
   */
  async findOne(id: string): Promise<Customer> {
    const customer = await this.customerRepository.findById(id);
    if (!customer) {
      throw new NotFoundException(`The requested Customer with ID [${id}] was not found.`);
    }
    return customer;
  }

  /**
   * Applies a partial update to a customer (AUDIT-014).
   *
   * A changed email is checked against the tenant's live customers first: the
   * table carries a partial unique index on `(email, tenantId) WHERE deleted_at
   * IS NULL` (migration 20260804000000), so a collision would otherwise surface
   * as an unhandled Prisma P2002 → HTTP 500 instead of a clean 409.
   */
  async updateCustomer(id: string, dto: UpdateCustomerRequestDto): Promise<Customer> {
    const existing = await this.customerRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`The requested Customer with ID [${id}] was not found.`);
    }

    if (dto.email !== undefined && dto.email !== existing.email) {
      const clash = await this.customerRepository.findMany({ email: dto.email });
      if (clash.some((c) => c.id !== id)) {
        throw new ConflictException(
          `Customer with email [${dto.email}] already exists under this tenant context.`,
        );
      }
    }

    const data = definedFields({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phoneNumber: dto.phoneNumber,
      loyaltyPoints: dto.loyaltyPoints,
    });

    if (Object.keys(data).length === 0) {
      return existing;
    }

    this.logger.log(`Updating customer [${id}]`);
    return this.customerRepository.update(id, data);
  }

  /**
   * Soft-deletes a customer (DOC-002 §2.8).
   *
   * Never a hard delete: `orders.customerId` is `ON DELETE SET NULL`, so a
   * physical delete would silently detach historical orders from the person who
   * placed them, corrupting loyalty and sales reporting. Refused while the
   * customer has an order in progress.
   */
  async deleteCustomer(id: string): Promise<SoftDeleteResult> {
    const existing = await this.customerRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`The requested Customer with ID [${id}] was not found.`);
    }

    const tenantId = (existing as unknown as { tenantId: string }).tenantId;
    const activeOrders = await countActiveOrders(id, tenantId);
    if (activeOrders > 0) {
      throw new ConflictException(
        `This customer cannot be deleted while they have ${activeOrders} order(s) in progress. Complete or cancel them first.`,
      );
    }

    await this.customerRepository.softDelete(id);
    this.logger.log(`Soft-deleted customer [${id}]`);
    return { id, deleted: true };
  }

  /**
   * Restores a soft-deleted customer.
   *
   * Refused when a live customer already holds the same email: the partial
   * unique index would reject the write as a raw 500 otherwise.
   */
  async restoreCustomer(id: string): Promise<RestoreResult> {
    const existing = (await this.customerRepository.findByIdIncludingDeleted(id)) as
      | (Customer & { email: string })
      | null;
    if (!existing) {
      throw new NotFoundException(`The requested Customer with ID [${id}] was not found.`);
    }

    const clash = await this.customerRepository.findMany({ email: existing.email });
    if (clash.some((c) => c.id !== id)) {
      throw new ConflictException(
        `A live customer already uses [${existing.email}]. Resolve the duplicate before restoring this record.`,
      );
    }

    await this.customerRepository.restore(id);
    this.logger.log(`Restored customer [${id}]`);
    return { id, restored: true };
  }
}

/** Drops `undefined` keys so a partial update never nulls an unmentioned column. */
function definedFields(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
}

/** Counts orders still operationally open for a customer. */
async function countActiveOrders(customerId: string, tenantId: string): Promise<number> {
  const rawPrisma = prisma as unknown as {
    order: { count: (args: Record<string, unknown>) => Promise<number> };
  };
  return rawPrisma.order.count({
    where: { customerId, tenantId, status: { in: [...ACTIVE_ORDER_STATUSES] } },
  });
}
