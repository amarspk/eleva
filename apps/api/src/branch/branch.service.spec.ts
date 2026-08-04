import { Test, TestingModule } from '@nestjs/testing';
import { BranchService, resolveSystemPepper } from './branch.service';
import { dbTenantContext, TenantBranchRepository, TenantTableRepository } from '@zayjar/db';

describe('BranchService Unit Tests', () => {
  let service: BranchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BranchService],
    }).compile();

    service = module.get<BranchService>(BranchService);
  });

  it('should successfully create branches and tables with secure QR tokens', async () => {
    const branchId = 'branch-uuid-1234';
    const tenantId = 'tenant-uuid-1111';

    // Mock Branch repository lookup
    const branchFindSpy = jest.spyOn(TenantBranchRepository.prototype, 'findById')
      .mockResolvedValue({ id: branchId, tenantId } as any);

    // Mock Table repository creation
    const tableCreateSpy = jest.spyOn(TenantTableRepository.prototype, 'create')
      .mockImplementation((data) => Promise.resolve(data as any));

    const dto = {
      branchId,
      number: 'Table-04',
      seatingCapacity: 4,
    };

    await dbTenantContext.run({ tenantId }, async () => {
      const result = await service.createTable(dto);

      expect(result.branchId).toBe(branchId);
      expect(result.number).toBe('Table-04');
      expect(result.qrCodeToken).toBeDefined();
      expect(result.qrCodeToken.length).toBe(64); // 64 Chars hex from HMAC-SHA256
      
      expect(branchFindSpy).toHaveBeenCalledWith(branchId);
      expect(tableCreateSpy).toHaveBeenCalled();
    });
  });

  // ==========================================
  // Production-readiness review — SYSTEM_PEPPER fail-closed
  // ==========================================
  describe('resolveSystemPepper (QR signing secret)', () => {
    const ORIGINAL_ENV = { ...process.env };

    afterEach(() => {
      process.env = { ...ORIGINAL_ENV };
    });

    it('refuses to fall back to the hardcoded pepper in production', () => {
      // Pre-fix this returned the repository-committed constant, so anyone
      // reading the source could forge QR tokens for any table of any tenant
      // (payload is tenantId:branchId:tableNumber, both ids are exposed by the
      // public guest surface).
      process.env.NODE_ENV = 'production';
      delete process.env.SYSTEM_PEPPER;

      expect(() => resolveSystemPepper()).toThrow(/SYSTEM_PEPPER must be set in production/);
    });

    it('uses the configured pepper when present in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.SYSTEM_PEPPER = 'a-real-production-pepper';

      expect(resolveSystemPepper()).toBe('a-real-production-pepper');
    });

    it('preserves the development fallback outside production', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.SYSTEM_PEPPER;

      expect(resolveSystemPepper()).toBe('zayjar-default-pepper-999!');
    });
  });
});
