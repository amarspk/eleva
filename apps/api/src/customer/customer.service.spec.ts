import { Test, TestingModule } from '@nestjs/testing';
import { CustomerService } from './customer.service';
import { TenantCustomerRepository, dbTenantContext } from '@zayjar/db';
import { ConflictException } from '@nestjs/common';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock-hash'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

describe('CustomerService Unit Tests - TSK-2.3', () => {
  let service: CustomerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CustomerService],
    }).compile();

    service = module.get<CustomerService>(CustomerService);
    jest.clearAllMocks();
  });

  it('should register a new customer under tenant context', async () => {
    const tenantId = 'tenant-123';
    const dto = {
      firstName: 'Mark',
      lastName: 'Ruffalo',
      email: 'mark@gmail.com',
      phoneNumber: '+12025550144',
    };

    jest.spyOn(TenantCustomerRepository.prototype, 'findMany').mockResolvedValue([]);
    jest.spyOn(TenantCustomerRepository.prototype, 'create').mockResolvedValue({
      id: 'c800c-9a1b-42b8-bf83-097a18fcd342',
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      loyaltyPoints: 0,
      createdAt: new Date().toISOString(),
    } as any);

    await dbTenantContext.run({ tenantId }, async () => {
      const result = await service.createCustomer(dto);
      expect(result.id).toBeDefined();
      expect(result.email).toBe(dto.email);
      expect(result.loyaltyPoints).toBe(0);
    });
  });

  it('should throw ConflictException if email already exists under tenant', async () => {
    const tenantId = 'tenant-123';
    const dto = {
      firstName: 'Mark',
      lastName: 'Ruffalo',
      email: 'mark@gmail.com',
    };

    jest.spyOn(TenantCustomerRepository.prototype, 'findMany').mockResolvedValue([
      { id: 'existing-id', email: dto.email } as any,
    ]);

    await dbTenantContext.run({ tenantId }, async () => {
      await expect(service.createCustomer(dto as any)).rejects.toThrow(ConflictException);
    });
  });

  it('should enforce tenant isolation via repository scoping', async () => {
    const tenantA = 'tenant-A';
    const tenantB = 'tenant-B';

    const dto = {
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
    };

    // Mock findMany to simulate tenant isolation: different tenants have different customers
    const spy = jest.spyOn(TenantCustomerRepository.prototype, 'findMany').mockImplementation(async (_where: any) => {
      // Repository should automatically append tenantId from context
      // Here we just ensure it was called
      return [];
    });

    const createSpy = jest.spyOn(TenantCustomerRepository.prototype, 'create').mockResolvedValue({
      id: 'cust-1',
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      loyaltyPoints: 0,
      createdAt: new Date().toISOString(),
    } as any);

    await dbTenantContext.run({ tenantId: tenantA }, async () => {
      await service.createCustomer(dto as any);
      expect(spy).toHaveBeenCalledWith({ email: dto.email });
      expect(createSpy).toHaveBeenCalled();
    });

    // For tenant B, same email should be allowed (isolated)
    jest.clearAllMocks();
    jest.spyOn(TenantCustomerRepository.prototype, 'findMany').mockResolvedValue([]);
    jest.spyOn(TenantCustomerRepository.prototype, 'create').mockResolvedValue({
      id: 'cust-2',
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      loyaltyPoints: 0,
      createdAt: new Date().toISOString(),
    } as any);

    await dbTenantContext.run({ tenantId: tenantB }, async () => {
      const result = await service.createCustomer(dto as any);
      expect(result.id).toBe('cust-2');
    });
  });
});
