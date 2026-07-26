import { Controller, Post, Get, Body, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { CreateCustomerRequestDto } from './dto/create-customer-request.dto';
import { Public } from '../auth/decorators/public.decorator';
import { AuthenticatedRequest } from '../common/types/request.types';

@Controller('api/v1/customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  /**
   * POST /api/v1/customers
   * Public customer registration – tenantId resolved from TenantContextMiddleware (subdomain / x-tenant-id / custom domain),
   * never trusted from client payload.
   */
  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCustomer(@Body() dto: CreateCustomerRequestDto, @Req() _req: AuthenticatedRequest): Promise<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    loyaltyPoints: number;
    createdAt: unknown;
  }> {
    // Tenant context is already enforced via dbTenantContext by repository layer
    // The middleware ensures tenantId exists, but we don't accept it from body
    return this.customerService.createCustomer(dto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async getCustomers(@Req() _req: AuthenticatedRequest): Promise<unknown> {
    // For internal use / staff, list customers under tenant
    return this.customerService.getCustomers();
  }
}
