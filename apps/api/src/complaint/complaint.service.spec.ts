import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ComplaintService } from './complaint.service';

jest.mock('@zayjar/db', () => {
  const ccFindUnique = jest.fn();
  const ccFindMany = jest.fn();
  const ccCreate = jest.fn();
  const ccUpdate = jest.fn();
  const cmFindMany = jest.fn();
  const cmCreate = jest.fn();
  const orderFindUnique = jest.fn();
  return {
    prisma: {
      customerComplaint: { findUnique: ccFindUnique, findMany: ccFindMany, create: ccCreate, update: ccUpdate },
      complaintMessage: { findMany: cmFindMany, create: cmCreate },
      order: { findUnique: orderFindUnique },
    },
    dbTenantContext: { run: jest.fn((c: unknown, fn: () => unknown) => fn()) },
    __m: { ccFindUnique, ccFindMany, ccCreate, ccUpdate, cmFindMany, cmCreate, orderFindUnique },
  };
});

const mockDb = jest.requireMock('@zayjar/db').__m as Record<string, jest.Mock>;
const complaintRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'c1', tenantId: 'tenant-1', customerId: 'cust-1', orderId: null,
  subject: 'Test', description: 'Issue', status: 'NEW',
  createdAt: new Date(), updatedAt: new Date(),
  resolvedAt: null, closedAt: null, ...overrides,
});

describe('ComplaintService (Phase 4 — Complaints)', () => {
  let service: ComplaintService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ComplaintService();
    Object.values(mockDb).forEach((m: jest.Mock) => m.mockReset());
    mockDb.ccFindUnique.mockResolvedValue(complaintRow());
    mockDb.ccFindMany.mockResolvedValue([complaintRow()]);
    mockDb.ccCreate.mockResolvedValue(complaintRow());
    mockDb.ccUpdate.mockImplementation(async (args: { data: Record<string, unknown> }) => complaintRow(args.data));
    mockDb.cmFindMany.mockResolvedValue([]);
    mockDb.cmCreate.mockImplementation(async (data: unknown) => {
      const payload =
        data && typeof data === 'object' && 'data' in data && (data as { data: unknown }).data && typeof (data as { data: unknown }).data === 'object'
          ? (data as { data: Record<string, unknown> }).data
          : {};
      return { ...payload, id: 'm1', createdAt: new Date() };
    });
    mockDb.orderFindUnique.mockResolvedValue({ id: 'o1', customerId: 'cust-1', tenantId: 'tenant-1' });
  });

  it('customer creates a complaint', async () => {
    const result = await service.create('cust-1', 'tenant-1', { subject: 'Test', description: 'Issue' });
    expect(result.subject).toBe('Test');
    expect(mockDb.ccCreate).toHaveBeenCalled();
  });

  it('validates order ownership on creation', async () => {
    mockDb.orderFindUnique.mockResolvedValue({ id: 'o1', customerId: 'other-cust', tenantId: 'tenant-1' });
    await expect(service.create('cust-1', 'tenant-1', { subject: 'Test', description: 'Issue', orderId: 'o1' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects linking an order from another tenant', async () => {
    mockDb.orderFindUnique.mockResolvedValue({ id: 'o1', customerId: 'cust-1', tenantId: 'tenant-OTHER' });
    await expect(service.create('cust-1', 'tenant-1', { subject: 'Test', description: 'Issue', orderId: 'o1' }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(mockDb.ccCreate).not.toHaveBeenCalled();
  });

  it('lists own complaints', async () => {
    const list = await service.listMy('cust-1');
    expect(list.length).toBe(1);
  });

  it('denies access to another customer complaint', async () => {
    mockDb.ccFindUnique.mockResolvedValue(complaintRow({ customerId: 'other-cust' }));
    await expect(service.getMy('cust-1', 'c1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows customer to get own complaint', async () => {
    const result = await service.getMy('cust-1', 'c1');
    expect(result.subject).toBe('Test');
  });

  it('adds customer message to own complaint', async () => {
    const msg = await service.addCustomerMessage('cust-1', 'c1', 'Thanks!');
    expect(msg.authorType).toBe('CUSTOMER');
  });

  it('blocks message on closed complaint', async () => {
    mockDb.ccFindUnique.mockResolvedValue(complaintRow({ status: 'CLOSED' }));
    await expect(service.addCustomerMessage('cust-1', 'c1', 'msg')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('staff lists complaints for the tenant', async () => {
    const list = await service.listStaff('tenant-1');
    expect(list.length).toBe(1);
  });

  it('staff cannot access cross-tenant complaint', async () => {
    mockDb.ccFindUnique.mockResolvedValue(complaintRow({ tenantId: 'tenant-2' }));
    await expect(service.getStaff('tenant-1', 'c1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows valid status transitions', async () => {
    mockDb.ccFindUnique.mockResolvedValue(complaintRow({ status: 'NEW' }));
    const result = await service.updateStatus('tenant-1', 'c1', 'REVIEWING');
    expect(result.status).toBe('REVIEWING');
  });

  it('rejects invalid status transitions', async () => {
    mockDb.ccFindUnique.mockResolvedValue(complaintRow({ status: 'NEW' }));
    await expect(service.updateStatus('tenant-1', 'c1', 'RESOLVED')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sets resolvedAt on RESOLVED and closedAt on CLOSED', async () => {
    mockDb.ccFindUnique.mockResolvedValue(complaintRow({ status: 'REVIEWING' }));
    mockDb.ccUpdate.mockResolvedValue(complaintRow({ status: 'RESOLVED', resolvedAt: new Date('2026-08-18') }));
    const resolved = await service.updateStatus('tenant-1', 'c1', 'RESOLVED');
    expect(resolved.resolvedAt).toBeTruthy();

    mockDb.ccFindUnique.mockResolvedValue(complaintRow({ status: 'RESOLVED' }));
    mockDb.ccUpdate.mockResolvedValue(complaintRow({ status: 'CLOSED', closedAt: new Date('2026-08-18') }));
    const closed = await service.updateStatus('tenant-1', 'c1', 'CLOSED');
    expect(closed.closedAt).toBeTruthy();
  });
});
