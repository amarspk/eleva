import { Controller, Post, Get, Put, Body, Param, Query, HttpCode, HttpStatus, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderRequestDto } from './dto/create-order-request.dto';
import { UpdateOrderStatusRequestDto } from './dto/update-order-status-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { RateLimitGuard, RateLimit } from '../common/rate-limit/rate-limit.guard';
import { AuthenticatedRequest } from '../common/types/request.types';
import { OptionalUuidPipe } from '../common/pipes/optional-uuid.pipe';

@Controller('api/v1/orders')
@UseGuards(JwtAuthGuard, RbacPermissionGuard, RateLimitGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('create', 'Order')
  @RateLimit('checkout')
  async createOrder(@Body() dto: CreateOrderRequestDto, @Req() req: AuthenticatedRequest): Promise<unknown> {
    const userTenantId = req.user.tenantId;
    if (!userTenantId) {
      throw new ForbiddenException('Tenant context missing from authenticated request');
    }
    // Phase 4 P0: the caller's assigned branches (from the verified JWT) are
    // passed server-side so createOrder enforces branch scope itself, in
    // addition to the RBAC guard's body-based CASL check.
    return this.orderService.createOrder(dto, userTenantId, req.user.branches);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('read', 'Order')
  async getOrder(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<unknown> {
    return this.orderService.getOrder(id, req.user.branches);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('read', 'Order')
  async getOrders(
    @Query('branchId', OptionalUuidPipe) branchId?: string,
    @Req() req?: AuthenticatedRequest,
  ): Promise<unknown> {
    // Phase 4 P0: the list endpoint is scoped server-side to the caller's
    // assigned branches (the RBAC guard cannot scope a list).
    return this.orderService.getOrders(branchId, req?.user?.branches);
  }

  @Put(':id/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('update', 'Order')
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusRequestDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.orderService.updateOrderStatus(id, dto, req.user.branches);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('update', 'Order')
  async cancelOrder(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<unknown> {
    return this.orderService.cancelOrder(id, req.user.branches);
  }
}
