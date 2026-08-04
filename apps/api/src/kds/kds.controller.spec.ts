import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { KdsController } from './kds.controller';
import { KdsService } from './kds.service';
import { AuthenticatedRequest } from '../common/types/request.types';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock-hash'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

/**
 * Production-readiness audit — HTTP status correctness.
 *
 * `KdsController` previously threw bare `Error` for two client-side
 * conditions, which Nest maps to HTTP 500. Runtime-verified before the fix:
 * `GET /api/v1/kds/tickets` with no `branchId` returned 500 for every role,
 * making a caller mistake indistinguishable from a server fault in logs,
 * alerting and error budgets.
 */
describe('KdsController — client errors must not surface as HTTP 500', () => {
  let controller: KdsController;
  let service: { getTickets: jest.Mock; updateCookingStatus: jest.Mock };

  const reqWith = (tenantId: string | null): AuthenticatedRequest =>
    ({
      user: {
        id: 'u1',
        email: 'staff@albaik.com',
        tenantId,
        roles: ['KITCHEN_STAFF'],
        permissions: ['kds:read', 'kds:write'],
      },
    }) as unknown as AuthenticatedRequest;

  beforeEach(() => {
    service = {
      getTickets: jest.fn().mockResolvedValue([]),
      updateCookingStatus: jest
        .fn()
        .mockResolvedValue({ orderItemId: 'oi1', cookingStatus: 'PREPARING', updatedAt: 'now' }),
    };
    controller = new KdsController(service as unknown as KdsService);
  });

  it('returns 400 (BadRequest) when the required branchId query param is missing', async () => {
    await expect(controller.getTickets('', reqWith('tenant-1'))).rejects.toThrow(
      BadRequestException,
    );
    expect(service.getTickets).not.toHaveBeenCalled();
  });

  it('returns 403 (Forbidden) when tenant context is absent on ticket read', async () => {
    await expect(controller.getTickets('branch-1', reqWith(null))).rejects.toThrow(
      ForbiddenException,
    );
    expect(service.getTickets).not.toHaveBeenCalled();
  });

  it('returns 403 (Forbidden) when tenant context is absent on status update', async () => {
    await expect(
      controller.updateItemStatus('order-item-1', { status: 'PREPARING' } as never, reqWith(null)),
    ).rejects.toThrow(ForbiddenException);
    expect(service.updateCookingStatus).not.toHaveBeenCalled();
  });

  it('passes through to the service on a well-formed request', async () => {
    await controller.getTickets('branch-1', reqWith('tenant-1'));

    expect(service.getTickets).toHaveBeenCalledWith('branch-1', 'tenant-1');
  });
});
