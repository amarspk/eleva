import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { CreateCustomerRequestDto } from './dto/create-customer-request.dto';
import { TenantCustomerRepository, Customer } from '@zayjar/db';

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

  async getCustomers(): Promise<Customer[]> {
    return this.customerRepository.findMany();
  }
}
