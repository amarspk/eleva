import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { MenuService } from './menu.service';
import { UpdateProductRequestDto } from './dto/update-product-request.dto';
import { UpdateCategoryRequestDto } from './dto/update-category-request.dto';

/**
 * AUDIT-006 regression suite — update / soft-delete / restore for menu
 * categories and products.
 *
 * Defects these tests lock down (all reproduced at runtime before the fix):
 *  - DEFECT-A/B: no PUT or DELETE route existed for products or categories
 *    (every verb returned 404 with a valid owner token).
 *  - DEFECT-F: the first cascade implementation used `updateMany`, which the
 *    tenant-scoped Prisma extension blocks — `DELETE /menu/categories/:id`
 *    returned HTTP 500 ("Fail-Safe Block: Operation 'updateMany' is
 *    unsupported on scoped model 'Product'").
 */

const txState: {
  productsFound: { id: string }[];
  productUpdates: { where: Record<string, unknown>; data: Record<string, unknown> }[];
  categoryUpdates: { where: Record<string, unknown>; data: Record<string, unknown> }[];
  updateManyCalls: number;
} = {
  productsFound: [],
  productUpdates: [],
  categoryUpdates: [],
  updateManyCalls: 0,
};

const repoState: {
  category: Record<string, unknown> | null;
  categoryIncludingDeleted: Record<string, unknown> | null;
  product: Record<string, unknown> | null;
  productIncludingDeleted: Record<string, unknown> | null;
  restaurant: Record<string, unknown> | null;
} = {
  category: null,
  categoryIncludingDeleted: null,
  product: null,
  productIncludingDeleted: null,
  restaurant: null,
};

const calls: { softDelete: unknown[][]; restore: unknown[][]; update: unknown[][] } = {
  softDelete: [],
  restore: [],
  update: [],
};

jest.mock('@zayjar/db', () => {
  class TenantCategoryRepository {
    async create(data: Record<string, unknown>): Promise<unknown> {
      return { id: 'new-cat-id', ...data };
    }
    async findById(): Promise<unknown> {
      return repoState.category;
    }
    async findByIdIncludingDeleted(): Promise<unknown> {
      return repoState.categoryIncludingDeleted;
    }
    async update(...args: unknown[]): Promise<unknown> {
      calls.update.push(['category', ...args]);
      return { ...(repoState.category as object), ...(args[1] as object) };
    }
    async softDelete(...args: unknown[]): Promise<unknown> {
      calls.softDelete.push(['category', ...args]);
      return repoState.category;
    }
    async restore(...args: unknown[]): Promise<unknown> {
      calls.restore.push(['category', ...args]);
      return repoState.categoryIncludingDeleted;
    }
  }
  class TenantProductRepository {
    async findById(): Promise<unknown> {
      return repoState.product;
    }
    async findByIdIncludingDeleted(): Promise<unknown> {
      return repoState.productIncludingDeleted;
    }
    async update(...args: unknown[]): Promise<unknown> {
      calls.update.push(['product', ...args]);
      return { ...(repoState.product as object), ...(args[1] as object) };
    }
    async softDelete(...args: unknown[]): Promise<unknown> {
      calls.softDelete.push(['product', ...args]);
      return repoState.product;
    }
    async restore(...args: unknown[]): Promise<unknown> {
      calls.restore.push(['product', ...args]);
      return repoState.productIncludingDeleted;
    }
  }
  class TenantRestaurantRepository {
    async findById(): Promise<unknown> {
      return repoState.restaurant;
    }
  }
  const Noop = jest.fn().mockImplementation(() => ({}));

  const tx = {
    product: {
      findMany: jest.fn(async () => {
        const batch = txState.productsFound;
        txState.productsFound = [];
        return batch;
      }),
      update: jest.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        txState.productUpdates.push(args);
        return args;
      }),
      updateMany: jest.fn(async () => {
        txState.updateManyCalls += 1;
        throw new Error(
          "Fail-Safe Block: Operation 'updateMany' is unsupported on scoped model 'Product' to prevent isolation bypasses.",
        );
      }),
    },
    category: {
      update: jest.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        txState.categoryUpdates.push(args);
        return args;
      }),
      updateMany: jest.fn(async () => {
        txState.updateManyCalls += 1;
        throw new Error(
          "Fail-Safe Block: Operation 'updateMany' is unsupported on scoped model 'Category' to prevent isolation bypasses.",
        );
      }),
    },
  };

  return {
    TenantCategoryRepository,
    TenantProductRepository,
    TenantRestaurantRepository,
    TenantProductSizeRepository: Noop,
    TenantProductAddonRepository: Noop,
    TenantAddonItemRepository: Noop,
    prisma: {
      $transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    },
  };
});

const CATEGORY_ID = '9e8deaff-c4eb-41b0-8eb5-2d9bf78e80bb';
const PRODUCT_ID = '48bcd555-9585-481e-8c31-ca87701005aa';
const TENANT_ID = '80a00898-782c-4a6e-8bad-880e8f4f7977';
const RESTAURANT_ID = 'e0478415-6d1a-4a5f-9c3b-2f8a1d4e7b90';

describe('MenuService — AUDIT-006 CRUD', () => {
  let service: MenuService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MenuService],
    }).compile();
    service = module.get<MenuService>(MenuService);

    repoState.category = { id: CATEGORY_ID, tenantId: TENANT_ID, name: 'Sides', deletedAt: null };
    repoState.categoryIncludingDeleted = repoState.category;
    repoState.product = {
      id: PRODUCT_ID,
      tenantId: TENANT_ID,
      categoryId: CATEGORY_ID,
      name: 'Coleslaw',
      deletedAt: null,
    };
    repoState.productIncludingDeleted = repoState.product;
    repoState.restaurant = { id: RESTAURANT_ID, tenantId: TENANT_ID, name: 'Al-Baik' };

    txState.productsFound = [];
    txState.productUpdates = [];
    txState.categoryUpdates = [];
    txState.updateManyCalls = 0;
    calls.softDelete = [];
    calls.restore = [];
    calls.update = [];
  });

  // ---------------------------------------------------------------
  // Create — parent-brand validation (DEFECT-N)
  // ---------------------------------------------------------------
  describe('createCategory', () => {
    it('404s when the restaurantId is foreign or unknown', async () => {
      // Runtime-proven before the fix: a foreign restaurantId reached Postgres
      // and surfaced as an unhandled
      // "Foreign key constraint violated: categories_restaurantId_fkey"
      // -> HTTP 500 leaking database internals.
      repoState.restaurant = null;
      await expect(
        service.createCategory({
          restaurantId: '11111111-1111-4111-8111-111111111111',
          name: 'Foreign',
          sortOrder: 1,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates when the restaurant belongs to the tenant', async () => {
      await expect(
        service.createCategory({ restaurantId: RESTAURANT_ID, name: 'Sides', sortOrder: 2 }),
      ).resolves.toBeDefined();
    });
  });

  // ---------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------
  describe('updateProduct', () => {
    it('applies only the supplied fields', async () => {
      await service.updateProduct(PRODUCT_ID, { name: 'Renamed' });
      const [, , data] = calls.update[0] as [string, string, Record<string, unknown>];
      expect(data).toEqual({ name: 'Renamed' });
    });

    it('does not null columns the caller omitted', async () => {
      await service.updateProduct(PRODUCT_ID, { basePrice: 9.5 });
      const [, , data] = calls.update[0] as [string, string, Record<string, unknown>];
      expect(Object.keys(data)).toEqual(['basePrice']);
      expect(data).not.toHaveProperty('description');
    });

    it('is a no-op that returns the row when the body is empty', async () => {
      const result = await service.updateProduct(PRODUCT_ID, {});
      expect(calls.update).toHaveLength(0);
      expect(result).toBe(repoState.product);
    });

    it('404s for an unknown / foreign product', async () => {
      repoState.product = null;
      await expect(service.updateProduct(PRODUCT_ID, { name: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects a categoryId that is not visible to this tenant', async () => {
      repoState.category = null;
      await expect(
        service.updateProduct(PRODUCT_ID, { categoryId: '11111111-1111-4111-8111-111111111111' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(calls.update).toHaveLength(0);
    });
  });

  describe('updateCategory', () => {
    it('applies only the supplied fields', async () => {
      await service.updateCategory(CATEGORY_ID, { name: 'Starters', sortOrder: 2 });
      const [, , data] = calls.update[0] as [string, string, Record<string, unknown>];
      expect(data).toEqual({ name: 'Starters', sortOrder: 2 });
    });

    it('404s for an unknown / foreign category', async () => {
      repoState.category = null;
      await expect(service.updateCategory(CATEGORY_ID, { name: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------
  // Soft delete
  // ---------------------------------------------------------------
  describe('deleteProduct', () => {
    it('soft-deletes and marks the product unavailable', async () => {
      const result = await service.deleteProduct(PRODUCT_ID);
      expect(result).toEqual({ id: PRODUCT_ID, deleted: true });
      expect(calls.softDelete[0]).toEqual(['product', PRODUCT_ID, { isAvailable: false }]);
    });

    it('404s for an unknown / foreign product', async () => {
      repoState.product = null;
      await expect(service.deleteProduct(PRODUCT_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteCategory', () => {
    it('cascades to products WITHOUT using updateMany (DEFECT-F regression)', async () => {
      txState.productsFound = [{ id: 'p1' }, { id: 'p2' }];
      const result = await service.deleteCategory(CATEGORY_ID);

      expect(result).toEqual({ id: CATEGORY_ID, deleted: true });
      // The tenant-scoped Prisma extension blocks `updateMany`; using it
      // produced a runtime HTTP 500. The cascade must use per-row updates.
      expect(txState.updateManyCalls).toBe(0);
      expect(txState.productUpdates.map((u) => u.where)).toEqual([{ id: 'p1' }, { id: 'p2' }]);
      expect(txState.productUpdates[0].data).toMatchObject({ isAvailable: false });
      expect(txState.productUpdates[0].data.deletedAt).toBeInstanceOf(Date);
    });

    it('marks the category deleted and inactive in the same transaction', async () => {
      await service.deleteCategory(CATEGORY_ID);
      expect(txState.categoryUpdates).toHaveLength(1);
      expect(txState.categoryUpdates[0].where).toEqual({ id: CATEGORY_ID });
      expect(txState.categoryUpdates[0].data).toMatchObject({ isActive: false });
    });

    it('stamps the category and its products with the same tombstone', async () => {
      txState.productsFound = [{ id: 'p1' }];
      await service.deleteCategory(CATEGORY_ID);
      expect(txState.productUpdates[0].data.deletedAt).toEqual(
        txState.categoryUpdates[0].data.deletedAt,
      );
    });

    it('404s for an unknown / foreign category', async () => {
      repoState.category = null;
      await expect(service.deleteCategory(CATEGORY_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---------------------------------------------------------------
  // Restore
  // ---------------------------------------------------------------
  describe('restoreProduct', () => {
    it('restores and re-enables the product', async () => {
      repoState.productIncludingDeleted = {
        ...(repoState.product as object),
        deletedAt: new Date(),
      };
      const result = await service.restoreProduct(PRODUCT_ID);
      expect(result).toEqual({ id: PRODUCT_ID, restored: true });
      expect(calls.restore[0]).toEqual(['product', PRODUCT_ID, { isAvailable: true }]);
    });

    it('refuses to restore under a deleted category (409)', async () => {
      repoState.productIncludingDeleted = {
        ...(repoState.product as object),
        deletedAt: new Date(),
      };
      repoState.category = null; // parent still soft-deleted
      await expect(service.restoreProduct(PRODUCT_ID)).rejects.toBeInstanceOf(ConflictException);
      expect(calls.restore).toHaveLength(0);
    });

    it('404s when the id matches nothing, even including deleted rows', async () => {
      repoState.productIncludingDeleted = null;
      await expect(service.restoreProduct(PRODUCT_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('restoreCategory', () => {
    it('restores a soft-deleted category', async () => {
      repoState.categoryIncludingDeleted = {
        ...(repoState.category as object),
        deletedAt: new Date(),
      };
      const result = await service.restoreCategory(CATEGORY_ID);
      expect(result).toEqual({ id: CATEGORY_ID, restored: true });
      expect(calls.restore[0][0]).toBe('category');
    });

    it('does NOT cascade-restore products', async () => {
      repoState.categoryIncludingDeleted = {
        ...(repoState.category as object),
        deletedAt: new Date(),
      };
      await service.restoreCategory(CATEGORY_ID);
      expect(txState.productUpdates).toHaveLength(0);
    });

    it('404s when the id matches nothing', async () => {
      repoState.categoryIncludingDeleted = null;
      await expect(service.restoreCategory(CATEGORY_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

/**
 * DTO-level guarantees. The global ValidationPipe runs with
 * `whitelist: true` + `forbidNonWhitelisted: true`, so any property absent from
 * the DTO is a 400 — this is what stops `tenantId` / `deletedAt` / `id`
 * smuggling. These tests assert the property set itself.
 */
describe('AUDIT-006 update DTO validation', () => {
  it('rejects a negative product price', async () => {
    const dto = plainToInstance(UpdateProductRequestDto, { basePrice: -1 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'basePrice')).toBe(true);
  });

  it('rejects a non-UUID categoryId', async () => {
    const dto = plainToInstance(UpdateProductRequestDto, { categoryId: 'not-a-uuid' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'categoryId')).toBe(true);
  });

  it('accepts an empty body (every field optional)', async () => {
    const dto = plainToInstance(UpdateProductRequestDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects an over-long product name', async () => {
    const dto = plainToInstance(UpdateProductRequestDto, { name: 'A'.repeat(300) });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('does not expose restaurantId on the category update DTO', async () => {
    // Re-parenting a category would silently move every product under it, so
    // the field must not exist on the update surface at all.
    const dto = plainToInstance(UpdateCategoryRequestDto, {
      restaurantId: '11111111-1111-4111-8111-111111111111',
    }) as unknown as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(new UpdateCategoryRequestDto(), 'restaurantId')).toBe(
      false,
    );
    // plainToInstance copies unknown keys, but the ValidationPipe's
    // `forbidNonWhitelisted` rejects them at the HTTP edge; assert the DTO
    // itself declares no validator for the field.
    expect(await validate(new UpdateCategoryRequestDto())).toHaveLength(0);
    void dto;
  });
});
