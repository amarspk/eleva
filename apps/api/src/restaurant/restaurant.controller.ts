import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { RestaurantService } from './restaurant.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { BooleanQueryPipe } from '../common/pipes/boolean-query.pipe';

/**
 * Restaurant (brand) read endpoints — AUDIT-014 DEFECT-L.
 *
 * Both `POST /api/v1/menu/categories` and `POST /api/v1/branches` require a
 * `restaurantId`, but nothing exposed one (`GET /api/v1/restaurants` was a hard
 * 404), so neither could be driven from a UI.
 *
 * Guarded by a dedicated `Restaurant` CASL subject. Reusing `Branch` was tried
 * first and is WRONG: `RbacPermissionGuard` re-resolves the `:id` path param
 * against the repository registered for the subject, so a Branch-guarded
 * `/restaurants/:id` searched the BRANCHES table and returned 404 for a valid
 * restaurant (runtime-proven). Write operations remain out of scope (AUDIT-008).
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

  @Get(':id')
  @RequirePermission('read', 'Restaurant')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<unknown> {
    return this.restaurantService.findOne(id);
  }
}
