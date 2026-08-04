import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { BranchService, SoftDeleteResult, RestoreResult } from './branch.service';
import { CreateBranchRequestDto } from './dto/create-branch-request.dto';
import { CreateTableRequestDto } from './dto/create-table-request.dto';
import { UpdateBranchRequestDto } from './dto/update-branch-request.dto';
import { UpdateTableRequestDto } from './dto/update-table-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { IncludeSoftDeleted } from '../auth/decorators/include-soft-deleted.decorator';
import { SubscriptionGuard, RequireSubscriptionCheck } from '../subscription/guards/subscription.guard';
import { OptionalUuidPipe } from '../common/pipes/optional-uuid.pipe';
import { BooleanQueryPipe } from '../common/pipes/boolean-query.pipe';

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
  async getBranches(
    @Query('includeDeleted', BooleanQueryPipe) includeDeleted: string,
  ): Promise<unknown> {
    return this.branchService.getBranches(includeDeleted as unknown as boolean);
  }

  /**
   * PUT /api/v1/branches/:id — partial update (AUDIT-007).
   */
  @Put('branches/:id')
  @RequirePermission('update', 'Branch')
  @HttpCode(HttpStatus.OK)
  async updateBranch(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBranchRequestDto,
  ): Promise<unknown> {
    return this.branchService.updateBranch(id, dto);
  }

  /**
   * DELETE /api/v1/branches/:id — soft delete (AUDIT-007).
   *
   * Cascades to the branch's tables in one transaction and is refused (409)
   * while any order is still in progress.
   */
  @Delete('branches/:id')
  @RequirePermission('delete', 'Branch')
  @HttpCode(HttpStatus.OK)
  async deleteBranch(@Param('id', new ParseUUIDPipe()) id: string): Promise<SoftDeleteResult> {
    return this.branchService.deleteBranch(id);
  }

  /**
   * POST /api/v1/branches/:id/restore — undo a soft delete (AUDIT-007).
   */
  @Post('branches/:id/restore')
  @RequirePermission('update', 'Branch')
  @IncludeSoftDeleted()
  @HttpCode(HttpStatus.OK)
  async restoreBranch(@Param('id', new ParseUUIDPipe()) id: string): Promise<RestoreResult> {
    return this.branchService.restoreBranch(id);
  }

  @Post('tables')
  @RequirePermission('create', 'Table')
  async createTable(@Body() dto: CreateTableRequestDto): Promise<unknown> {
    return this.branchService.createTable(dto);
  }

  @Get('tables')
  @RequirePermission('read', 'Table')
  async getTables(
    @Query('branchId', OptionalUuidPipe) branchId: string,
    @Query('includeDeleted', BooleanQueryPipe) includeDeleted: string,
  ): Promise<unknown> {
    return this.branchService.getTables(branchId, includeDeleted as unknown as boolean);
  }

  /**
   * PUT /api/v1/tables/:id — partial update (AUDIT-007).
   *
   * Only `seatingCapacity` and `status` are mutable; `branchId` and `number`
   * feed the printed QR token and are therefore immutable by design.
   */
  @Put('tables/:id')
  @RequirePermission('update', 'Table')
  @HttpCode(HttpStatus.OK)
  async updateTable(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTableRequestDto,
  ): Promise<unknown> {
    return this.branchService.updateTable(id, dto);
  }

  /**
   * DELETE /api/v1/tables/:id — soft delete (AUDIT-007).
   *
   * Refused (409) while the table has orders in progress.
   */
  @Delete('tables/:id')
  @RequirePermission('delete', 'Table')
  @HttpCode(HttpStatus.OK)
  async deleteTable(@Param('id', new ParseUUIDPipe()) id: string): Promise<SoftDeleteResult> {
    return this.branchService.deleteTable(id);
  }

  /**
   * POST /api/v1/tables/:id/restore — undo a soft delete (AUDIT-007).
   */
  @Post('tables/:id/restore')
  @RequirePermission('update', 'Table')
  @IncludeSoftDeleted()
  @HttpCode(HttpStatus.OK)
  async restoreTable(@Param('id', new ParseUUIDPipe()) id: string): Promise<RestoreResult> {
    return this.branchService.restoreTable(id);
  }
}
