import { Controller, Post, Get, Put, Body, Param, Query, HttpCode, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderRequestDto } from './dto/create-order-request.dto';
import { UpdateOrderStatusRequestDto } from './dto/update-order-status-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { RateLimitGuard, RateLimit } from '../common/rate-limit/rate-limit.guard';
import { AuthenticatedRequest } from '../common/types/request.types';

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
    return this.orderService.createOrder(dto, userTenantId);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('read', 'Order')
  async getOrder(@Param('id') id: string): Promise<unknown> {
    return this.orderService.getOrder(id);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('read', 'Order')
  async getOrders(@Query('branchId') branchId?: string): Promise<unknown> {
    return this.orderService.getOrders(branchId);
  }

  @Put(':id/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('update', 'Order')
  async updateOrderStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusRequestDto): Promise<unknown> {
    return this.orderService.updateOrderStatus(id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('update', 'Order')
  async cancelOrder(@Param('id') id: string): Promise<unknown> {
    return this.orderService.cancelOrder(id);
  }
}
