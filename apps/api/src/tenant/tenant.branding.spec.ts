import { Test, TestingModule } from '@nestjs/testing';
import { TenantService } from './tenant.service';
import { AuthService } from '../auth/auth.service';
import { prisma, prismaRead } from '@zayjar/db';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock-hash'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

describe('TenantService Branding Unit Tests - TSK-2.5', () => {
  let service: TenantService;

  const mockAuthService = {
    hashPassword: jest.fn().mockResolvedValue('mock-hash'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantService,
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    service = module.get<TenantService>(TenantService);
    jest.clearAllMocks();
  });

  describe('GET /tenants/:id', () => {
    it('should return tenant branding profile', async () => {
      const tenantId = 't1';
      const mockTenant = {
        id: tenantId,
        name: 'Gourmet Burger LLC',
        subdomain: 'gourmet-burgers',
        customDomain: 'ordering.gourmetburgers.com',
        status: 'ACTIVE',
        logoUrl: 'https://cdn.zayjar.com/t110c/logo.webp',
        bannerUrl: 'https://cdn.zayjar.com/t110c/cover.webp',
        primaryColor: '#FF5733',
        secondaryColor: '#C70039',
        branding: {},
      };

      jest.spyOn(prismaRead.tenant, 'findUnique').mockResolvedValue(mockTenant as any);

      const result = await service.getTenantById(tenantId);

      expect(result.id).toBe(tenantId);
      expect(result.branding.logoUrl).toBe(mockTenant.logoUrl);
      expect(result.branding.primaryColor).toBe(mockTenant.primaryColor);
    });

    it('should throw NotFoundException if tenant not found', async () => {
      jest.spyOn(prismaRead.tenant, 'findUnique').mockResolvedValue(null);

      await expect(service.getTenantById('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should enforce tenant isolation for non-platform owners', async () => {
      const tenantId = 't1';
      const mockTenant = {
        id: tenantId,
        name: 'Gourmet',
        subdomain: 'gourmet',
        status: 'ACTIVE',
        logoUrl: null,
        bannerUrl: null,
        primaryColor: '#000',
        secondaryColor: '#FFF',
        customDomain: null,
        branding: {},
      };

      jest.spyOn(prismaRead.tenant, 'findUnique').mockResolvedValue(mockTenant as any);

      const requester = { tenantId: 'different-tenant', roles: ['RESTAURANT_OWNER'] };

      await expect(service.getTenantById(tenantId, requester)).rejects.toThrow(ForbiddenException);
    });

    it('should allow PLATFORM_OWNER to access any tenant', async () => {
      const tenantId = 't1';
      const mockTenant = {
        id: tenantId,
        name: 'Gourmet',
        subdomain: 'gourmet',
        status: 'ACTIVE',
        logoUrl: null,
        bannerUrl: null,
        primaryColor: '#000',
        secondaryColor: '#FFF',
        customDomain: null,
        branding: {},
      };

      jest.spyOn(prismaRead.tenant, 'findUnique').mockResolvedValue(mockTenant as any);

      const requester = { tenantId: 'other-tenant', roles: ['PLATFORM_OWNER'] };

      const result = await service.getTenantById(tenantId, requester);
      expect(result.id).toBe(tenantId);
    });

    it('should merge JSONB dynamic branding into response', async () => {
      const tenantId = 't1';
      const mockTenant = {
        id: tenantId,
        name: 'Gourmet',
        subdomain: 'gourmet',
        status: 'ACTIVE',
        logoUrl: 'https://cdn.example.com/logo.webp',
        bannerUrl: null,
        primaryColor: '#FF5733',
        secondaryColor: '#C70039',
        customDomain: null,
        branding: {
          menuLayout: 'grid',
          translations: { ar: { welcome: 'أهلا' } },
          customCss: '.header { background: #FF5733; }',
        },
      };

      jest.spyOn(prismaRead.tenant, 'findUnique').mockResolvedValue(mockTenant as any);

      const result = await service.getTenantById(tenantId);

      expect(result.branding.logoUrl).toBe('https://cdn.example.com/logo.webp');
      expect(result.branding.primaryColor).toBe('#FF5733');
      expect(result.branding.menuLayout).toBe('grid');
      expect(result.branding.translations).toEqual({ ar: { welcome: 'أهلا' } });
      expect(result.branding.customCss).toBe('.header { background: #FF5733; }');
    });
  });

  describe('PUT /tenants/:id', () => {
    it('should update tenant branding', async () => {
      const tenantId = 't1';
      const existing = {
        id: tenantId,
        name: 'Old Name',
        subdomain: 'gourmet',
        customDomain: null,
        status: 'ACTIVE',
        logoUrl: null,
        bannerUrl: null,
        primaryColor: '#000',
        secondaryColor: '#FFF',
        branding: {},
      };

      const updated = {
        id: tenantId,
        name: 'Gourmet Burger Kitchen',
        subdomain: 'gourmet',
        customDomain: 'menu.gourmetburgers.com',
        status: 'ACTIVE',
        logoUrl: 'https://cdn.zayjar.com/t110c/new-logo.webp',
        bannerUrl: 'https://cdn.zayjar.com/t110c/new-cover.webp',
        primaryColor: '#00FF66',
        secondaryColor: '#009933',
        branding: {},
        updatedAt: new Date().toISOString(),
      };

      jest.spyOn(prisma.tenant, 'findUnique')
        .mockResolvedValueOnce(existing as any) // first call for existence
        .mockResolvedValueOnce(null); // second for domain conflict check

      jest.spyOn(prisma.tenant, 'update').mockResolvedValue(updated as any);

      const dto = {
        name: 'Gourmet Burger Kitchen',
        customDomain: 'menu.gourmetburgers.com',
        branding: {
          logoUrl: 'https://cdn.zayjar.com/t110c/new-logo.webp',
          bannerUrl: 'https://cdn.zayjar.com/t110c/new-cover.webp',
          primaryColor: '#00FF66',
          secondaryColor: '#009933',
        },
      };

      const requester = { tenantId, roles: ['RESTAURANT_OWNER'] };

      const result = await service.updateTenant(tenantId, dto, requester);

      expect(result.name).toBe('Gourmet Burger Kitchen');
      expect(result.customDomain).toBe('menu.gourmetburgers.com');
      expect(result.branding.primaryColor).toBe('#00FF66');
    });

    it('should throw ConflictException if customDomain already taken', async () => {
      const tenantId = 't1';
      const existing = {
        id: tenantId,
        name: 'Gourmet',
        subdomain: 'gourmet',
      };

      const conflict = {
        id: 'other-tenant',
        customDomain: 'taken.domain.com',
      };

      jest.spyOn(prisma.tenant, 'findUnique')
        .mockResolvedValueOnce(existing as any)
        .mockResolvedValueOnce(conflict as any);

      const dto = {
        customDomain: 'taken.domain.com',
      };

      const requester = { tenantId, roles: ['RESTAURANT_OWNER'] };

      await expect(service.updateTenant(tenantId, dto as any, requester)).rejects.toThrow(ConflictException);
    });

    it('should enforce tenant isolation on update', async () => {
      const tenantId = 't1';
      const existing = {
        id: tenantId,
        name: 'Gourmet',
        subdomain: 'gourmet',
      };

      jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue(existing as any);

      const dto = { name: 'Hacked Name' };
      const requester = { tenantId: 'evil-tenant', roles: ['RESTAURANT_OWNER'] };

      await expect(service.updateTenant(tenantId, dto as any, requester)).rejects.toThrow(ForbiddenException);
    });

    it('should update JSONB dynamic branding alongside static fields', async () => {
      const tenantId = 't1';
      const existing = {
        id: tenantId,
        name: 'Gourmet',
        subdomain: 'gourmet',
        customDomain: null,
        status: 'ACTIVE',
        logoUrl: null,
        bannerUrl: null,
        primaryColor: '#000',
        secondaryColor: '#FFF',
        branding: { menuLayout: 'list', translations: {} },
      };

      const updated = {
        id: tenantId,
        name: 'Gourmet',
        subdomain: 'gourmet',
        customDomain: null,
        status: 'ACTIVE',
        logoUrl: null,
        bannerUrl: null,
        primaryColor: '#000',
        secondaryColor: '#FFF',
        branding: { menuLayout: 'grid', translations: { ar: { menu: 'القائمة' } }, customFont: 'Roboto' },
        updatedAt: new Date().toISOString(),
      };

      jest.spyOn(prisma.tenant, 'findUnique')
        .mockResolvedValueOnce(existing as any)
        .mockResolvedValueOnce(null);

      jest.spyOn(prisma.tenant, 'update').mockResolvedValue(updated as any);

      const dto = {
        branding: {
          dynamic: {
            menuLayout: 'grid',
            translations: { ar: { menu: 'القائمة' } },
            customFont: 'Roboto',
          },
        },
      };

      const requester = { tenantId, roles: ['RESTAURANT_OWNER'] };

      const result = await service.updateTenant(tenantId, dto as any, requester);

      expect(result.branding.menuLayout).toBe('grid');
      expect(result.branding.translations).toEqual({ ar: { menu: 'القائمة' } });
      expect(result.branding.customFont).toBe('Roboto');
    });
  });
});
