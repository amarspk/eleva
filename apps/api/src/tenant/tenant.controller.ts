import { Controller, Post, Get, Put, Body, Param, Req, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { CreateTenantRequestDto } from './dto/create-tenant-request.dto';
import { UpdateTenantRequestDto } from './dto/update-tenant-request.dto';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { SubscriptionGuard, RequireSubscriptionCheck } from '../subscription/guards/subscription.guard';
import { AuthenticatedRequest } from '../common/types/request.types';

@Controller('api/v1/tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Public()
  @Get('plans')
  @HttpCode(HttpStatus.OK)
  async getPlans(): Promise<Array<{
    id: string;
    name: string;
    priceMonthly: number;
    priceYearly: number;
    maxBranches: number;
    maxRestaurants: number;
    maxProductsPerBranch: number;
    allowCustomDomains: boolean;
    allowOnlinePayments: boolean;
    allowAnalytics: boolean;
  }>> {
    return this.tenantService.getAvailablePlans();
  }

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async onboard(@Body() dto: CreateTenantRequestDto): Promise<{
    tenant: { id: string; name: string; subdomain: string; status: string };
    owner: { id: string; email: string };
    restaurant: { id: string; name: string; currency: string; timezone: string };
    branch: { id: string; name: string };
  }> {
    return this.tenantService.onboard(dto);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async getTenant(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<{
    id: string;
    name: string;
    subdomain: string;
    customDomain: string | null;
    status: string;
    branding: Record<string, unknown>;
  }> {
    const requester = req.user ? { tenantId: req.user.tenantId, roles: req.user.roles } : undefined;
    return this.tenantService.getTenantById(id, requester);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RbacPermissionGuard, SubscriptionGuard)
  @RequirePermission('update', 'Tenant')
  @RequireSubscriptionCheck('customDomain')
  async updateTenant(@Param('id') id: string, @Body() dto: UpdateTenantRequestDto, @Req() req: AuthenticatedRequest): Promise<{
    id: string;
    name: string;
    subdomain: string;
    customDomain: string | null;
    status: string;
    branding: Record<string, unknown>;
    updatedAt: unknown;
  }> {
    const requester = req.user ? { tenantId: req.user.tenantId, roles: req.user.roles } : undefined;
    return this.tenantService.updateTenant(id, dto, requester);
  }
}
