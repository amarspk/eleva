import { Controller, Post, Get, Put, Body, Param, Req, HttpCode, HttpStatus, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CustomerAuthGuard } from '../customer/guards/customer-auth.guard';
import { ComplaintService } from './complaint.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { AddMessageDto } from './dto/add-message.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import type { AuthenticatedRequest } from '../common/types/request.types';

interface CustomerReq extends Request { customer?: { customerId: string; tenantId: string | null } }

@Controller()
export class ComplaintController {
  constructor(private readonly complaintService: ComplaintService) {}

  // ── Customer-facing ─────────────────────────────────────────

  @Post('api/v1/customer/complaints')
  @UseGuards(CustomerAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: CustomerReq, @Body() dto: CreateComplaintDto): Promise<unknown> {
    const cust = req.customer; if (!cust) return { error: 'Not authenticated.' };
    return this.complaintService.create(cust.customerId, cust.tenantId || '', dto);
  }

  @Get('api/v1/customer/complaints')
  @UseGuards(CustomerAuthGuard)
  @HttpCode(HttpStatus.OK)
  async listMy(@Req() req: CustomerReq): Promise<unknown> {
    const cust = req.customer; if (!cust) return [];
    return this.complaintService.listMy(cust.customerId);
  }

  @Get('api/v1/customer/complaints/:id')
  @UseGuards(CustomerAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getMy(@Req() req: CustomerReq, @Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    const cust = req.customer; if (!cust) return { error: 'Not authenticated.' };
    return this.complaintService.getMy(cust.customerId, id);
  }

  @Post('api/v1/customer/complaints/:id/messages')
  @UseGuards(CustomerAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async addMessage(@Req() req: CustomerReq, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddMessageDto): Promise<unknown> {
    const cust = req.customer; if (!cust) return { error: 'Not authenticated.' };
    return this.complaintService.addCustomerMessage(cust.customerId, id, dto.message);
  }

  // ── Staff ───────────────────────────────────────────────────

  @Get('api/v1/backoffice/complaints')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'Customer')
  @HttpCode(HttpStatus.OK)
  async listStaff(@Req() req: AuthenticatedRequest): Promise<unknown> {
    if (!req.user?.tenantId) return [];
    return this.complaintService.listStaff(req.user.tenantId);
  }

  @Get('api/v1/backoffice/complaints/:id')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'Customer')
  @HttpCode(HttpStatus.OK)
  async getStaff(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    if (!req.user?.tenantId) return { error: 'Tenant required.' };
    return this.complaintService.getStaff(req.user.tenantId, id);
  }

  @Post('api/v1/backoffice/complaints/:id/messages')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('update', 'Customer')
  @HttpCode(HttpStatus.CREATED)
  async staffMessage(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddMessageDto): Promise<unknown> {
    if (!req.user?.tenantId) return { error: 'Tenant required.' };
    return this.complaintService.addStaffMessage(req.user.tenantId, id, dto.message);
  }

  @Put('api/v1/backoffice/complaints/:id/status')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('update', 'Customer')
  @HttpCode(HttpStatus.OK)
  async updateStatus(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStatusDto): Promise<unknown> {
    if (!req.user?.tenantId) return { error: 'Tenant required.' };
    return this.complaintService.updateStatus(req.user.tenantId, id, dto.status);
  }
}
