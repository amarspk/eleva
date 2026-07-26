import { Test, TestingModule } from '@nestjs/testing';
import { MenuService } from './menu.service';

jest.mock('@zayjar/db', () => {
  const MockRepo = jest.fn().mockImplementation(() => ({
    create: jest.fn().mockResolvedValue({ id: 'mock-id', createdAt: new Date(), updatedAt: new Date() }),
    findMany: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
    delete: jest.fn(),
  }));
  return {
    TenantCategoryRepository: MockRepo,
    TenantProductRepository: MockRepo,
    TenantProductSizeRepository: MockRepo,
    TenantProductAddonRepository: MockRepo,
    TenantAddonItemRepository: MockRepo,
  };
});

describe('MenuService', () => {
  let service: MenuService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MenuService],
    }).compile();

    service = module.get<MenuService>(MenuService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createCategory', () => {
    it('should create a category with the given name', async () => {
      const dto = { name: 'Burgers', restaurantId: 'rest-1', sortOrder: 1 };
      const result = await service.createCategory(dto);
      expect(result).toBeDefined();
      expect(result.id).toBe('mock-id');
    });
  });

  describe('getCategories', () => {
    it('should return an array of categories', async () => {
      const result = await service.getCategories();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('createProduct', () => {
    it('should create a product with the given details', async () => {
      const dto = {
        name: 'Classic Burger',
        categoryId: 'cat-1',
        basePrice: 12.99,
        description: 'A classic beef burger',
        calories: 650,
        preparationTime: 20,
      };
      const result = await service.createProduct(dto);
      expect(result).toBeDefined();
      expect(result.id).toBe('mock-id');
    });
  });

  describe('getProducts', () => {
    it('should return products for a category', async () => {
      const result = await service.getProducts('cat-1');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('createProductSize', () => {
    it('should create a size option for a product', async () => {
      const result = await service.createProductSize('prod-1', 'Large', 3.00);
      expect(result).toBeDefined();
    });
  });

  describe('createProductAddon', () => {
    it('should create an addon group for a product', async () => {
      const result = await service.createProductAddon('prod-1', 'Toppings', 0, 3);
      expect(result).toBeDefined();
    });
  });

  describe('createAddonItem', () => {
    it('should create an addon choice within a group', async () => {
      const result = await service.createAddonItem('addon-1', 'Extra Cheese', 1.50);
      expect(result).toBeDefined();
    });
  });
});
