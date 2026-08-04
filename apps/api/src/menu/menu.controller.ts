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
import { MenuService, SoftDeleteResult, RestoreResult } from './menu.service';
import { CreateCategoryRequestDto } from './dto/create-category-request.dto';
import { CreateProductRequestDto } from './dto/create-product-request.dto';
import { UpdateCategoryRequestDto } from './dto/update-category-request.dto';
import { UpdateProductRequestDto } from './dto/update-product-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { IncludeSoftDeleted } from '../auth/decorators/include-soft-deleted.decorator';
import { SubscriptionGuard, RequireSubscriptionCheck } from '../subscription/guards/subscription.guard';
import { RateLimitGuard, RateLimit } from '../common/rate-limit/rate-limit.guard';
import { OptionalUuidPipe } from '../common/pipes/optional-uuid.pipe';
import { BooleanQueryPipe } from '../common/pipes/boolean-query.pipe';

@Controller('api/v1/menu')
@UseGuards(JwtAuthGuard, RbacPermissionGuard, SubscriptionGuard, RateLimitGuard)
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Post('categories')
  @RequirePermission('create', 'Product')
  async createCategory(@Body() dto: CreateCategoryRequestDto): Promise<unknown> {
    return this.menuService.createCategory(dto);
  }

  /**
   * `includeDeleted=true` surfaces archived categories so the Backoffice
   * archive view can restore them (AUDIT-014 DEFECT-J). Defaults to false, so
   * every existing caller is unaffected.
   */
  @Get('categories')
  @RequirePermission('read', 'Product')
  @RateLimit('public')
  async getCategories(
    @Query('includeDeleted', BooleanQueryPipe) includeDeleted: string,
  ): Promise<unknown> {
    return this.menuService.getCategories(includeDeleted as unknown as boolean);
  }

  /**
   * PUT /api/v1/menu/categories/:id — partial update (AUDIT-006).
   *
   * `Category` is a first-class CASL subject as of AUDIT-006, so the guard
   * re-resolves the row under tenant scope before the ability check: a foreign
   * id is a 404, never a 403 that would confirm the record exists.
   */
  @Put('categories/:id')
  @RequirePermission('update', 'Category')
  @HttpCode(HttpStatus.OK)
  async updateCategory(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCategoryRequestDto,
  ): Promise<unknown> {
    return this.menuService.updateCategory(id, dto);
  }

  /**
   * DELETE /api/v1/menu/categories/:id — soft delete (AUDIT-006).
   *
   * Sets `deletedAt` on the category and cascades to its products in one
   * transaction. There is deliberately no hard-delete endpoint: DOC-002 §638
   * requires menu components linked to historical orders to be preserved.
   */
  @Delete('categories/:id')
  @RequirePermission('delete', 'Category')
  @HttpCode(HttpStatus.OK)
  async deleteCategory(@Param('id', new ParseUUIDPipe()) id: string): Promise<SoftDeleteResult> {
    return this.menuService.deleteCategory(id);
  }

  /**
   * POST /api/v1/menu/categories/:id/restore — undo a soft delete (AUDIT-006).
   *
   * Guarded by the `update` action rather than a bespoke one: restoring is a
   * state change on an existing record, and inventing a `restore` action would
   * require a new permission string on every existing role.
   */
  @Post('categories/:id/restore')
  @RequirePermission('update', 'Category')
  @IncludeSoftDeleted()
  @HttpCode(HttpStatus.OK)
  async restoreCategory(@Param('id', new ParseUUIDPipe()) id: string): Promise<RestoreResult> {
    return this.menuService.restoreCategory(id);
  }

  @Post('products')
  @RequirePermission('create', 'Product')
  @RequireSubscriptionCheck('product')
  async createProduct(@Body() dto: CreateProductRequestDto): Promise<unknown> {
    return this.menuService.createProduct(dto);
  }

  @Get('products')
  @RequirePermission('read', 'Product')
  @RateLimit('public')
  async getProducts(
    @Query('categoryId', OptionalUuidPipe) categoryId: string,
    @Query('includeDeleted', BooleanQueryPipe) includeDeleted: string,
  ): Promise<unknown> {
    return this.menuService.getProducts(categoryId, includeDeleted as unknown as boolean);
  }

  /**
   * PUT /api/v1/menu/products/:id — partial update (AUDIT-006).
   */
  @Put('products/:id')
  @RequirePermission('update', 'Product')
  @HttpCode(HttpStatus.OK)
  async updateProduct(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProductRequestDto,
  ): Promise<unknown> {
    return this.menuService.updateProduct(id, dto);
  }

  /**
   * DELETE /api/v1/menu/products/:id — soft delete (AUDIT-006).
   *
   * Never a hard delete: `order_items.productId` is `ON DELETE RESTRICT`, so
   * removing a product that has ever been ordered would either be refused by
   * the database or destroy sales history.
   */
  @Delete('products/:id')
  @RequirePermission('delete', 'Product')
  @HttpCode(HttpStatus.OK)
  async deleteProduct(@Param('id', new ParseUUIDPipe()) id: string): Promise<SoftDeleteResult> {
    return this.menuService.deleteProduct(id);
  }

  /**
   * POST /api/v1/menu/products/:id/restore — undo a soft delete (AUDIT-006).
   */
  @Post('products/:id/restore')
  @RequirePermission('update', 'Product')
  @IncludeSoftDeleted()
  @HttpCode(HttpStatus.OK)
  async restoreProduct(@Param('id', new ParseUUIDPipe()) id: string): Promise<RestoreResult> {
    return this.menuService.restoreProduct(id);
  }

  @Post('sizes')
  @RequirePermission('create', 'Product')
  async createProductSize(
    @Body('productId') productId: string,
    @Body('name') name: string,
    @Body('priceAdjustment') priceAdjustment: number,
  ): Promise<unknown> {
    return this.menuService.createProductSize(productId, name, priceAdjustment);
  }

  @Post('addons')
  @RequirePermission('create', 'Product')
  async createProductAddon(
    @Body('productId') productId: string,
    @Body('name') name: string,
    @Body('minSelections') minSelections?: number,
    @Body('maxSelections') maxSelections?: number,
  ): Promise<unknown> {
    return this.menuService.createProductAddon(productId, name, minSelections, maxSelections);
  }

  @Post('addon-items')
  @RequirePermission('create', 'Product')
  async createAddonItem(
    @Body('addonGroupId') addonGroupId: string,
    @Body('name') name: string,
    @Body('price') price: number,
  ): Promise<unknown> {
    return this.menuService.createAddonItem(addonGroupId, name, price);
  }
}
