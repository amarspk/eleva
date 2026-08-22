import { Controller, Post, Get, Body, Param, Req, HttpCode, HttpStatus, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CustomerAuthGuard } from '../customer/guards/customer-auth.guard';
import { RatingService } from './rating.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import type { AuthenticatedRequest, RequestWithTenant } from '../common/types/request.types';

interface CustomerReq extends Request { customer?: { customerId: string; tenantId: string | null } }

@Controller()
export class RatingController {
  constructor(private readonly ratingService: RatingService) {}

  @Post('api/v1/customer/ratings')
  @UseGuards(CustomerAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: CustomerReq, @Body() dto: CreateRatingDto): Promise<unknown> {
    if (!req.customer) {return { error: 'Not authenticated.' };}
    return this.ratingService.rateOrder(req.customer.customerId, dto);
  }

  @Get('api/v1/customer/ratings')
  @UseGuards(CustomerAuthGuard)
  @HttpCode(HttpStatus.OK)
  async listMy(@Req() req: CustomerReq): Promise<unknown> {
    if (!req.customer) {return [];}
    return this.ratingService.listMy(req.customer.customerId);
  }

  @Get('api/v1/customer/ratings/:id')
  @UseGuards(CustomerAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getMy(@Req() req: CustomerReq, @Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    if (!req.customer) {return { error: 'Not authenticated.' };}
    return this.ratingService.getMy(req.customer.customerId, id);
  }

  @Get('api/v1/backoffice/ratings')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'Customer')
  @HttpCode(HttpStatus.OK)
  async listStaff(@Req() req: AuthenticatedRequest): Promise<unknown> {
    if (!req.user?.tenantId) {return [];}
    return this.ratingService.listStaff(req.user.tenantId);
  }

  @Public()
  @Get('api/v1/public/ratings')
  @HttpCode(HttpStatus.OK)
  async listPublic(@Req() req: RequestWithTenant): Promise<unknown> {
    return this.ratingService.listPublic(req.tenantId ?? '');
  }
}