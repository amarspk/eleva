import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CustomerService, SoftDeleteResult, RestoreResult } from './customer.service';
import { CreateCustomerRequestDto } from './dto/create-customer-request.dto';
import { UpdateCustomerRequestDto } from './dto/update-customer-request.dto';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { IncludeSoftDeleted } from '../auth/decorators/include-soft-deleted.decorator';
import { BooleanQueryPipe } from '../common/pipes/boolean-query.pipe';
import { AuthenticatedRequest } from '../common/types/request.types';

/**
 * Customer management (AUDIT-014).
 *
 * SECURITY (DEFECT-H, runtime-proven): this controller previously carried NO
 * `@UseGuards` at all. There is no global auth guard (only `CsrfGuard` is
 * registered as `APP_GUARD`), so `GET /api/v1/customers` returned HTTP 200 with
 * the tenant's entire customer table — full names, email addresses and loyalty
 * balances — to any completely unauthenticated caller. Reproduced with a bare
 * `curl` and no `Authorization` header before this fix.
 *
 * The guards are now applied at class level. `POST` remains `@Public()` by
 * design (guest self-registration during QR checkout), so the public surface is
 * unchanged; every other verb requires a signature-verified identity plus the
 * matching CASL ability on the `Customer` subject.
 */
@Controller('api/v1/customers')
@UseGuards(JwtAuthGuard, RbacPermissionGuard)
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

  /**
   * GET /api/v1/customers — staff-only list of the tenant's customers.
   * Soft-deleted rows are hidden by the repository's `deletedAt IS NULL` filter.
   */
  @Get()
  @RequirePermission('read', 'Customer')
  @HttpCode(HttpStatus.OK)
  async getCustomers(
    @Req() _req: AuthenticatedRequest,
    @Query('includeDeleted', BooleanQueryPipe) includeDeleted: string,
  ): Promise<unknown> {
    return this.customerService.getCustomers(includeDeleted as unknown as boolean);
  }

  /**
   * GET /api/v1/customers/:id — single customer, tenant-scoped.
   */
  @Get(':id')
  @RequirePermission('read', 'Customer')
  @HttpCode(HttpStatus.OK)
  async getCustomer(@Param('id', new ParseUUIDPipe()) id: string): Promise<unknown> {
    return this.customerService.findOne(id);
  }

  /**
   * PUT /api/v1/customers/:id — partial update.
   */
  @Put(':id')
  @RequirePermission('update', 'Customer')
  @HttpCode(HttpStatus.OK)
  async updateCustomer(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCustomerRequestDto,
  ): Promise<unknown> {
    return this.customerService.updateCustomer(id, dto);
  }

  /**
   * DELETE /api/v1/customers/:id — soft delete.
   *
   * No hard-delete endpoint: `orders.customerId` is `ON DELETE SET NULL`, so a
   * physical delete would detach historical orders from their customer.
   */
  @Delete(':id')
  @RequirePermission('delete', 'Customer')
  @HttpCode(HttpStatus.OK)
  async deleteCustomer(@Param('id', new ParseUUIDPipe()) id: string): Promise<SoftDeleteResult> {
    return this.customerService.deleteCustomer(id);
  }

  /**
   * POST /api/v1/customers/:id/restore — undo a soft delete.
   */
  @Post(':id/restore')
  @RequirePermission('update', 'Customer')
  @IncludeSoftDeleted()
  @HttpCode(HttpStatus.OK)
  async restoreCustomer(@Param('id', new ParseUUIDPipe()) id: string): Promise<RestoreResult> {
    return this.customerService.restoreCustomer(id);
  }
}
