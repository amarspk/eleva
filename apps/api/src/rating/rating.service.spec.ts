import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RatingService } from './rating.service';

jest.mock('@zayjar/db', () => {
  const orFindUnique = jest.fn();
  const orFindMany = jest.fn();
  const orCreate = jest.fn();
  const orderFindUnique = jest.fn();
  return {
    prisma: {
      orderRating: { findUnique: orFindUnique, findMany: orFindMany, create: orCreate },
      order: { findUnique: orderFindUnique },
    },
    dbTenantContext: { run: jest.fn((c: unknown, fn: () => unknown) => fn()) },
    __m: { orFindUnique, orFindMany, orCreate, orderFindUnique },
  };
});

const mockDb = jest.requireMock('@zayjar/db').__m as Record<string, jest.Mock>;
const completedOrder = { id: 'o1', tenantId: 't1', customerId: 'c1', status: 'COMPLETED' };
const ratingRow = { id: 'r1', tenantId: 't1', customerId: 'c1', orderId: 'o1', rating: 5, feedback: 'Great!', createdAt: new Date() };

describe('RatingService (Phase 4 — Ratings & Feedback)', () => {
  let service: RatingService;
  let initialMock: Record<string, unknown>;
  beforeEach(() => {
    jest.clearAllMocks();
    service = new RatingService();
    Object.values(mockDb).forEach((m: jest.Mock) => { try { m.mockReset(); } catch { /* */ } });
    mockDb.orderFindUnique.mockResolvedValue(completedOrder);
    // orFindUnique returns ratingRow for by-id lookup (getMy), null for by-orderId (duplicate check)
    mockDb.orFindUnique.mockImplementation(async (args: Record<string, Record<string, string>>) => {
      if (args?.where?.id) return ratingRow;
      if (args?.where?.orderId) return null; // no existing rating for new orders
      return null;
    });
    mockDb.orCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      ...ratingRow, ...(args?.data || {}),
    }));
    mockDb.orFindMany.mockResolvedValue([ratingRow]);
  });

  it('submits a valid rating for an eligible completed order', async () => {
    const result = await service.rateOrder('c1', { orderId: 'o1', rating: 5, feedback: 'Great!' });
    expect(result.rating).toBe(5);
    expect(result.feedback).toBe('Great!');
  });

  it('rejects rating for another customer\'s order', async () => {
    mockDb.orderFindUnique.mockResolvedValue({ ...completedOrder, customerId: 'other' });
    await expect(service.rateOrder('c1', { orderId: 'o1', rating: 4 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects rating for a non-completed order', async () => {
    mockDb.orderFindUnique.mockResolvedValue({ ...completedOrder, status: 'PENDING' });
    await expect(service.rateOrder('c1', { orderId: 'o1', rating: 4 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('prevents duplicate rating for the same order', async () => {
    mockDb.orFindUnique.mockResolvedValue(ratingRow);
    await expect(service.rateOrder('c1', { orderId: 'o1', rating: 3 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects rating out of range (below 1 and above 5)', async () => {
    await expect(service.rateOrder('c1', { orderId: 'o1', rating: 0 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.rateOrder('c1', { orderId: 'o1', rating: 6 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('customer can list own ratings', async () => {
    const list = await service.listMy('c1');
    expect(list.length).toBe(1);
  });

  it('customer can view own rating', async () => {
    const r = await service.getMy('c1', 'r1');
    expect(r.rating).toBe(5);
  });

  it('customer cannot view another customer\'s rating', async () => {
    mockDb.orFindUnique.mockReset();
    mockDb.orFindUnique.mockResolvedValue({ ...ratingRow, customerId: 'other' });
    await expect(service.getMy('c1', 'r1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('staff lists ratings for the tenant (tenant-scoped)', async () => {
    const list = await service.listStaff('t1');
    expect(list.length).toBe(1);
  });

  it('public ratings omit customer id', async () => {
    const list = await service.listPublic('t1');
    expect(list[0].customerId).toBeUndefined();
    expect(list[0].rating).toBe(5);
  });
});