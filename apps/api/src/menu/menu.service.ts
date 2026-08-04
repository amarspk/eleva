import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { CreateCategoryRequestDto } from './dto/create-category-request.dto';
import { CreateProductRequestDto } from './dto/create-product-request.dto';
import { UpdateCategoryRequestDto } from './dto/update-category-request.dto';
import { UpdateProductRequestDto } from './dto/update-product-request.dto';
import {
  TenantCategoryRepository,
  TenantProductRepository,
  TenantProductSizeRepository,
  TenantProductAddonRepository,
  TenantAddonItemRepository,
  TenantRestaurantRepository,
  Category,
  Product,
  ProductSize,
  ProductAddon,
  AddonItem,
  prisma,
} from '@zayjar/db';

/** Uniform response for a soft-delete / restore mutation. */
export interface SoftDeleteResult {
  id: string;
  deleted: boolean;
}

export interface RestoreResult {
  id: string;
  restored: true;
}

@Injectable()
export class MenuService {
  private readonly logger = new Logger('MenuService');

  private readonly categoryRepository = new TenantCategoryRepository();
  private readonly productRepository = new TenantProductRepository();
  private readonly sizeRepository = new TenantProductSizeRepository();
  private readonly addonRepository = new TenantProductAddonRepository();
  private readonly addonItemRepository = new TenantAddonItemRepository();
  /** Used only to validate the parent brand on category create (DEFECT-N). */
  private readonly restaurantRepository = new TenantRestaurantRepository();

  /**
   * Transaction envelope for cascading soft deletes. Mirrors
   * `UserService.TX_OPTIONS` so a slow cascade cannot pin a connection.
   */
  private static readonly TX_OPTIONS = { maxWait: 5000, timeout: 15000 };

  /** Page size for the category -> products cascade. */
  private static readonly CASCADE_BATCH_SIZE = 200;

  /**
   * Creates a menu category to organize products.
   */
  async createCategory(dto: CreateCategoryRequestDto): Promise<Category> {
    this.logger.log(`Creating menu category: [${dto.name}]`);

    // AUDIT-014 (DEFECT-N): validate the parent brand before inserting.
    // `restaurantId` is a plain FK, so an id belonging to another tenant (or to
    // nothing at all) reached Postgres and surfaced as an unhandled
    // `Foreign key constraint violated: categories_restaurantId_fkey` — HTTP
    // 500 with a database internals leak (runtime-proven). The tenant-scoped
    // repository read below returns null for foreign and unknown ids alike, so
    // the caller gets a uniform 404 and no existence oracle.
    const restaurant = await this.restaurantRepository.findById(dto.restaurantId);
    if (!restaurant) {
      throw new NotFoundException(
        `The requested Restaurant with ID [${dto.restaurantId}] was not found.`,
      );
    }

    return this.categoryRepository.create({
      restaurantId: dto.restaurantId,
      name: dto.name,
      sortOrder: dto.sortOrder,
      isActive: true,
    });
  }

  /**
   * Retrieves all categories scoped to the tenant.
   *
   * AUDIT-014 (DEFECT-J): `includeDeleted` exists so the Backoffice archive
   * view can list soft-deleted rows. Without it the restore endpoints shipped
   * in AUDIT-006/007 were unreachable from any client — every list filters
   * `deletedAt IS NULL`, so an operator could never obtain the id of an
   * archived record to restore it. Passing `deletedAt: undefined` suppresses
   * the filter in `BaseTenantRepository.scopedWhere` while leaving the tenant
   * predicate untouched.
   */
  async getCategories(includeDeleted = false): Promise<Category[]> {
    return this.categoryRepository.findMany(
      includeDeleted ? { deletedAt: undefined } : {},
    );
  }

  /**
   * Adds a product to a menu category.
   */
  async createProduct(dto: CreateProductRequestDto): Promise<Product> {
    this.logger.log(`Adding product [${dto.name}] under category ID: [${dto.categoryId}]`);
    return this.productRepository.create({
      categoryId: dto.categoryId,
      name: dto.name,
      description: dto.description || null,
      imageUrl: dto.imageUrl || null,
      basePrice: dto.basePrice,
      isAvailable: true,
      calories: dto.calories || null,
      preparationTime: dto.preparationTime || 15,
    });
  }

  /**
   * Retrieves all products scoped to the category.
   *
   * See `getCategories` for why `includeDeleted` exists (AUDIT-014 DEFECT-J).
   */
  async getProducts(categoryId?: string, includeDeleted = false): Promise<Product[]> {
    const where: Record<string, unknown> = {};
    if (categoryId) {
      where.categoryId = categoryId;
    }
    if (includeDeleted) {
      where.deletedAt = undefined;
    }
    return this.productRepository.findMany(where);
  }

  // ==========================================
  // AUDIT-006 — Category update / soft-delete / restore
  // ==========================================

  /**
   * Applies a partial update to a category.
   *
   * The record is re-resolved through the tenant-scoped repository first, so a
   * foreign or soft-deleted id yields 404 rather than touching another tenant's
   * row. `restaurantId` is not accepted by the DTO and therefore cannot move.
   */
  async updateCategory(id: string, dto: UpdateCategoryRequestDto): Promise<Category> {
    const existing = await this.categoryRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`The requested Category with ID [${id}] was not found.`);
    }

    const data = this.definedFields({
      name: dto.name,
      sortOrder: dto.sortOrder,
      isActive: dto.isActive,
    });

    if (Object.keys(data).length === 0) {
      return existing;
    }

    this.logger.log(`Updating category [${id}]`);
    return this.categoryRepository.update(id, data);
  }

  /**
   * Soft-deletes a category (DOC-002 §2.8) and, in the same transaction, its
   * products.
   *
   * Cascading matters for correctness, not convenience: products are read by
   * `categoryId`, so a product left active under a deleted category becomes
   * unreachable through the category tree yet still visible to
   * `GET /menu/products` and still orderable on the guest menu. Deleting the
   * pair atomically keeps the catalogue self-consistent.
   *
   * Rows are preserved, so historical `order_items` (which reference products
   * with `ON DELETE RESTRICT`) remain intact and reportable.
   */
  async deleteCategory(id: string): Promise<SoftDeleteResult> {
    const existing = await this.categoryRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`The requested Category with ID [${id}] was not found.`);
    }

    const tenantId = (existing as unknown as { tenantId: string }).tenantId;
    const now = new Date();

    // A single transaction so a category can never end up deleted while its
    // products stay live (or vice versa) if the connection drops mid-way.
    //
    // Rows are updated one by one rather than with `updateMany`: the
    // tenant-scoped Prisma extension deliberately blocks `updateMany` on scoped
    // models to prevent isolation bypasses (runtime-proven — the first
    // implementation of this method returned HTTP 500 with "Fail-Safe Block:
    // Operation 'updateMany' is unsupported on scoped model 'Product'").
    // Keeping the writes on `update` means every statement still passes through
    // the extension's tenant enforcement instead of working around it.
    await prisma.$transaction(async (tx) => {
      const rawTx = tx as unknown as {
        product: {
          findMany: (args: Record<string, unknown>) => Promise<{ id: string }[]>;
          update: (args: Record<string, unknown>) => Promise<unknown>;
        };
        category: { update: (args: Record<string, unknown>) => Promise<unknown> };
      };

      // Batched so a pathologically large catalogue cannot be loaded whole.
      // Each pass marks its rows deleted, so they drop out of the next query
      // and the loop always terminates.
      for (;;) {
        const batch = await rawTx.product.findMany({
          where: { categoryId: id, tenantId, deletedAt: null },
          select: { id: true },
          take: MenuService.CASCADE_BATCH_SIZE,
        });
        if (batch.length === 0) {
          break;
        }
        for (const product of batch) {
          await rawTx.product.update({
            where: { id: product.id },
            data: { deletedAt: now, isAvailable: false },
          });
        }
        if (batch.length < MenuService.CASCADE_BATCH_SIZE) {
          break;
        }
      }

      await rawTx.category.update({
        where: { id },
        data: { deletedAt: now, isActive: false },
      });
    }, MenuService.TX_OPTIONS);

    this.logger.log(`Soft-deleted category [${id}] and its products for tenant [${tenantId}]`);
    return { id, deleted: true };
  }

  /**
   * Restores a soft-deleted category.
   *
   * Products are intentionally NOT cascaded back: a product may have been
   * deleted individually before the category was, and blindly restoring the
   * whole set would resurrect items the operator removed on purpose. Products
   * are restored one by one via `POST /menu/products/:id/restore`.
   */
  async restoreCategory(id: string): Promise<RestoreResult> {
    const existing = await this.categoryRepository.findByIdIncludingDeleted(id);
    if (!existing) {
      throw new NotFoundException(`The requested Category with ID [${id}] was not found.`);
    }

    await this.categoryRepository.restore(id);
    this.logger.log(`Restored category [${id}]`);
    return { id, restored: true };
  }

  // ==========================================
  // AUDIT-006 — Product update / soft-delete / restore
  // ==========================================

  /**
   * Applies a partial update to a product.
   *
   * A supplied `categoryId` is validated against the same tenant before it is
   * written: the column is a plain FK, so an id belonging to another tenant
   * would otherwise be accepted by the database and silently expose the product
   * on a foreign menu.
   */
  async updateProduct(id: string, dto: UpdateProductRequestDto): Promise<Product> {
    const existing = await this.productRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`The requested Product with ID [${id}] was not found.`);
    }

    if (dto.categoryId !== undefined) {
      const category = await this.categoryRepository.findById(dto.categoryId);
      if (!category) {
        throw new NotFoundException(`The requested Category with ID [${dto.categoryId}] was not found.`);
      }
    }

    const data = this.definedFields({
      categoryId: dto.categoryId,
      name: dto.name,
      description: dto.description,
      imageUrl: dto.imageUrl,
      basePrice: dto.basePrice,
      isAvailable: dto.isAvailable,
      calories: dto.calories,
      preparationTime: dto.preparationTime,
    });

    if (Object.keys(data).length === 0) {
      return existing;
    }

    this.logger.log(`Updating product [${id}]`);
    return this.productRepository.update(id, data);
  }

  /**
   * Soft-deletes a product (DOC-002 §2.8).
   *
   * Never a hard delete: `order_items.productId` is `ON DELETE RESTRICT`, so a
   * physical delete of any product that has ever been ordered would be refused
   * by the database (and, if it succeeded, would destroy sales history). The
   * row stays and is simply hidden from every active read.
   */
  async deleteProduct(id: string): Promise<SoftDeleteResult> {
    const existing = await this.productRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`The requested Product with ID [${id}] was not found.`);
    }

    await this.productRepository.softDelete(id, { isAvailable: false });
    this.logger.log(`Soft-deleted product [${id}]`);
    return { id, deleted: true };
  }

  /**
   * Restores a soft-deleted product.
   *
   * Refused when the parent category is itself deleted: the product would come
   * back attached to an invisible parent and would be unreachable from the menu
   * tree while still appearing in flat product reads.
   */
  async restoreProduct(id: string): Promise<RestoreResult> {
    const existing = (await this.productRepository.findByIdIncludingDeleted(id)) as
      | (Product & { categoryId: string })
      | null;
    if (!existing) {
      throw new NotFoundException(`The requested Product with ID [${id}] was not found.`);
    }

    const category = await this.categoryRepository.findById(existing.categoryId);
    if (!category) {
      throw new ConflictException(
        'This product cannot be restored because its category is deleted. Restore the category first.',
      );
    }

    await this.productRepository.restore(id, { isAvailable: true });
    this.logger.log(`Restored product [${id}]`);
    return { id, restored: true };
  }

  /**
   * Drops keys whose value is `undefined` so a partial update never overwrites
   * a column with null. `null` is preserved where a caller sends it explicitly.
   */
  private definedFields(input: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  }

  /**
   * Defines a sizing adjustment option for a product.
   */
  async createProductSize(productId: string, name: string, priceAdjustment: number): Promise<ProductSize> {
    this.logger.log(`Configuring size [${name}] for product ID: [${productId}]`);
    return this.sizeRepository.create({
      productId,
      name,
      priceAdjustment,
    });
  }

  /**
   * Creates an addon group configuration for product customization.
   */
  async createProductAddon(productId: string, name: string, minSelections = 0, maxSelections = 1): Promise<ProductAddon> {
    this.logger.log(`Adding addon group [${name}] for product ID: [${productId}]`);
    return this.addonRepository.create({
      productId,
      name,
      minSelections,
      maxSelections,
    });
  }

  /**
   * Defines a choice option inside an addon customization group.
   */
  async createAddonItem(addonGroupId: string, name: string, price: number): Promise<AddonItem> {
    this.logger.log(`Configuring addon choice [${name}] under group ID: [${addonGroupId}]`);
    return this.addonItemRepository.create({
      addonGroupId,
      name,
      price,
      isAvailable: true,
    });
  }
}
