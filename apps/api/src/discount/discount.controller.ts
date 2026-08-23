import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { DiscountAdminService, DeleteDiscountResult } from './discount-admin.service';
import { CreateDiscountRequestDto } from './dto/create-discount-request.dto';
import { UpdateDiscountRequestDto } from './dto/update-discount-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

/**
 * AUDIT-009 — staff Discount CRUD. Tenant-scoped via ALS + repository.
 * Foreign ids 404 (no existence oracle).
 */
@Controller('api/v1/discounts')
@UseGuards(JwtAuthGuard, RbacPermissionGuard)
export class DiscountController {
  constructor(private readonly discountAdminService: DiscountAdminService) {}

  @Get()
  @RequirePermission('read', 'Discount')
  @HttpCode(HttpStatus.OK)
  async findAll(): Promise<unknown> {
    return this.discountAdminService.findAll();
  }

  @Post()
  @RequirePermission('create', 'Discount')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateDiscountRequestDto): Promise<unknown> {
    return this.discountAdminService.create(dto);
  }

  @Get(':id')
  @RequirePermission('read', 'Discount')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<unknown> {
    return this.discountAdminService.findOne(id);
  }

  @Put(':id')
  @RequirePermission('update', 'Discount')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDiscountRequestDto,
  ): Promise<unknown> {
    return this.discountAdminService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('delete', 'Discount')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<DeleteDiscountResult> {
    return this.discountAdminService.remove(id);
  }
}
