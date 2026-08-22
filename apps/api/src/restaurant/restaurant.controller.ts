import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { RestaurantService, SoftDeleteResult, RestoreResult } from './restaurant.service';
import { CreateRestaurantRequestDto } from './dto/create-restaurant-request.dto';
import { UpdateRestaurantRequestDto } from './dto/update-restaurant-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { IncludeSoftDeleted } from '../auth/decorators/include-soft-deleted.decorator';
import { BooleanQueryPipe } from '../common/pipes/boolean-query.pipe';
import { AuthenticatedRequest } from '../common/types/request.types';

/**
 * Restaurant (brand) endpoints.
 *
 * Reads: AUDIT-014 DEFECT-L.
 * Writes: AUDIT-008 — create / update / soft-delete / restore.
 *
 * Guarded by the dedicated `Restaurant` CASL subject so RbacPermissionGuard
 * re-resolves `:id` against TenantRestaurantRepository (never Branch).
 */
@Controller('api/v1/restaurants')
@UseGuards(JwtAuthGuard, RbacPermissionGuard)
export class RestaurantController {
  constructor(private readonly restaurantService: RestaurantService) {}

  @Get()
  @RequirePermission('read', 'Restaurant')
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query('includeDeleted', BooleanQueryPipe) includeDeleted: string,
  ): Promise<unknown> {
    return this.restaurantService.findAll(includeDeleted as unknown as boolean);
  }

  @Post()
  @RequirePermission('create', 'Restaurant')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateRestaurantRequestDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = req.user?.tenantId ?? req.tenantId;
    return this.restaurantService.create(dto, tenantId as string);
  }

  @Get(':id')
  @RequirePermission('read', 'Restaurant')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<unknown> {
    return this.restaurantService.findOne(id);
  }

  @Put(':id')
  @RequirePermission('update', 'Restaurant')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRestaurantRequestDto,
  ): Promise<unknown> {
    return this.restaurantService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('delete', 'Restaurant')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<SoftDeleteResult> {
    return this.restaurantService.remove(id);
  }

  @Post(':id/restore')
  @RequirePermission('update', 'Restaurant')
  @IncludeSoftDeleted()
  @HttpCode(HttpStatus.OK)
  async restore(@Param('id', new ParseUUIDPipe()) id: string): Promise<RestoreResult> {
    return this.restaurantService.restore(id);
  }
}
