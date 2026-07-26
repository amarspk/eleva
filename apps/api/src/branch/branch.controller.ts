import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { BranchService } from './branch.service';
import { CreateBranchRequestDto } from './dto/create-branch-request.dto';
import { CreateTableRequestDto } from './dto/create-table-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { SubscriptionGuard, RequireSubscriptionCheck } from '../subscription/guards/subscription.guard';

@Controller('api/v1')
@UseGuards(JwtAuthGuard, RbacPermissionGuard, SubscriptionGuard)
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @Post('branches')
  @RequirePermission('create', 'Branch')
  @RequireSubscriptionCheck('branch')
  async createBranch(@Body() dto: CreateBranchRequestDto): Promise<unknown> {
    return this.branchService.createBranch(dto);
  }

  @Get('branches')
  @RequirePermission('read', 'Branch')
  async getBranches(): Promise<unknown> {
    return this.branchService.getBranches();
  }

  @Post('tables')
  @RequirePermission('create', 'Table')
  async createTable(@Body() dto: CreateTableRequestDto): Promise<unknown> {
    return this.branchService.createTable(dto);
  }

  @Get('tables')
  @RequirePermission('read', 'Table')
  async getTables(@Query('branchId') branchId: string): Promise<unknown> {
    return this.branchService.getTables(branchId);
  }
}
