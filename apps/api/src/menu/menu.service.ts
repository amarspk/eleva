import { Injectable, Logger } from '@nestjs/common';
import { CreateCategoryRequestDto } from './dto/create-category-request.dto';
import { CreateProductRequestDto } from './dto/create-product-request.dto';
import {
  TenantCategoryRepository,
  TenantProductRepository,
  TenantProductSizeRepository,
  TenantProductAddonRepository,
  TenantAddonItemRepository,
  Category,
  Product,
  ProductSize,
  ProductAddon,
  AddonItem,
} from '@zayjar/db';

@Injectable()
export class MenuService {
  private readonly logger = new Logger('MenuService');

  private readonly categoryRepository = new TenantCategoryRepository();
  private readonly productRepository = new TenantProductRepository();
  private readonly sizeRepository = new TenantProductSizeRepository();
  private readonly addonRepository = new TenantProductAddonRepository();
  private readonly addonItemRepository = new TenantAddonItemRepository();

  /**
   * Creates a menu category to organize products.
   */
  async createCategory(dto: CreateCategoryRequestDto): Promise<Category> {
    this.logger.log(`Creating menu category: [${dto.name}]`);
    return this.categoryRepository.create({
      restaurantId: dto.restaurantId,
      name: dto.name,
      sortOrder: dto.sortOrder,
      isActive: true,
    });
  }

  /**
   * Retrieves all categories scoped to the tenant.
   */
  async getCategories(): Promise<Category[]> {
    return this.categoryRepository.findMany();
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
   */
  async getProducts(categoryId: string): Promise<Product[]> {
    return this.productRepository.findMany({ categoryId });
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
