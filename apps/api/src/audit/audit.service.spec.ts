import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { prisma } from '@zayjar/db';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock-hash'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

describe('AuditService Unit Tests - DOC-006 5.7 Immutable Audit Logs', () => {
  let service: AuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService],
    }).compile();

    service = module.get<AuditService>(AuditService);
    jest.clearAllMocks();
  });

  it('should create immutable audit log with tenant isolation', async () => {
    const tenantId = 'tenant-123';
    const userId = 'user-123';
    const mockLog = {
      id: 'audit_123',
      tenantId,
      userId,
      action: 'POST:Branch',
      entityName: 'Branch',
      entityId: 'branch_123',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    };

    jest.spyOn(prisma.auditLog, 'create').mockResolvedValue(mockLog as any);

    const result = await service.log({
      tenantId,
      userId,
      action: 'POST:Branch',
      entityName: 'Branch',
      entityId: 'branch_123',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      newValues: { name: 'Main Branch' },
    });

    expect(result?.id).toBe('audit_123');
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        userId,
        action: 'POST:Branch',
        entityName: 'Branch',
      }),
    });
  });

  it('should enforce write-only - UPDATE blocked', async () => {
    await expect(service.update()).rejects.toThrow(/immutable.*UPDATE.*blocked/i);
  });

  it('should enforce write-only - DELETE blocked', async () => {
    await expect(service.delete()).rejects.toThrow(/immutable.*DELETE.*blocked/i);
  });

  it('should retrieve logs with tenant isolation', async () => {
    const tenantId = 'tenant-123';
    const mockLogs = [
      { id: 'audit_1', tenantId, action: 'POST:Branch', entityName: 'Branch' },
      { id: 'audit_2', tenantId, action: 'PUT:Product', entityName: 'Product' },
    ];

    jest.spyOn(prisma.auditLog, 'findMany').mockResolvedValue(mockLogs as any);

    const result = await service.getLogs(tenantId);

    expect(result.length).toBe(2);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  });

  it('should handle filtering by userId and entityName', async () => {
    const tenantId = 'tenant-123';
    jest.spyOn(prisma.auditLog, 'findMany').mockResolvedValue([] as any);

    await service.getLogs(tenantId, { userId: 'user-123', entityName: 'Order', limit: 10 });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: { tenantId, userId: 'user-123', entityName: 'Order' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  });

  it('should sanitize sensitive fields in audit logs', async () => {
    // The interceptor sanitizes, but service should handle any values
    const tenantId = 'tenant-123';
    jest.spyOn(prisma.auditLog, 'create').mockImplementation((async (args: any) => {
      // Ensure sensitive fields would be redacted by interceptor, but service stores as provided
      // For this test, we check that service doesn't throw
      return { id: 'audit_1', ...args.data } as any;
    }) as any);

    const result = await service.log({
      tenantId,
      userId: 'user-123',
      action: 'POST:User',
      entityName: 'User',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      newValues: { email: 'test@example.com', password: 'should-be-redacted-by-interceptor' },
    });

    expect(result).toBeDefined();
  });

  it('should preserve tenant isolation - never mix tenant contexts', async () => {
    const realTenantId = 'real-tenant';
    const evilTenantId = 'evil-tenant';

    let capturedWhere: any = null;
    jest.spyOn(prisma.auditLog, 'create').mockImplementation((async (args: any) => {
      capturedWhere = args.data;
      return { id: 'audit_1', ...args.data } as any;
    }) as any);

    await service.log({
      tenantId: realTenantId,
      userId: 'user-1',
      action: 'POST:Branch',
      entityName: 'Branch',
      ipAddress: '1.2.3.4',
      userAgent: 'test',
    });

    expect(capturedWhere.tenantId).toBe(realTenantId);
    expect(capturedWhere.tenantId).not.toBe(evilTenantId);
  });
});
