import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { prisma } from '@zayjar/db';
import { HealthController } from './health.controller';

jest.mock('@zayjar/db', () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}));

const mockQueryRaw = prisma.$queryRaw as jest.Mock;

describe('AUDIT-023 HealthController /live and /ready', () => {
  let controller: HealthController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();
    controller = module.get<HealthController>(HealthController);
  });

  describe('/live (process-only liveness)', () => {
    it('returns ok without touching the database or any other dependency', () => {
      const result = controller.getLive();
      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(mockQueryRaw).not.toHaveBeenCalled();
    });

    it('keeps the legacy /health contract identical in shape to /live', () => {
      const health = controller.getHealth();
      const live = controller.getLive();
      expect(Object.keys(health).sort()).toEqual(Object.keys(live).sort());
      expect(health.status).toBe('ok');
      expect(new Date(health.timestamp).toString()).not.toBe('Invalid Date');
    });
  });

  describe('/ready (database availability only)', () => {
    it('reports ready when the database answers SELECT 1', async () => {
      mockQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
      const result = await controller.getReady();
      expect(result.status).toBe('ready');
      expect(result.checks.database).toBe('up');
      expect(result.timestamp).toBeDefined();
      // Redis is deliberately not part of readiness (optional/fallback-capable
      // per the existing platform contract) — the checks object must not
      // invent a Redis requirement.
      expect(Object.keys(result.checks)).toEqual(['database']);
    });

    it('fails with 503 when the database is unavailable', async () => {
      mockQueryRaw.mockRejectedValue(new Error('connection refused'));
      const failure = await controller.getReady().catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(ServiceUnavailableException);
      expect((failure as ServiceUnavailableException).getStatus()).toBe(503);
      expect((failure as ServiceUnavailableException).getResponse()).toMatchObject({
        status: 'unavailable',
        checks: { database: 'down' },
      });
    });

    it('fails with 503 when the database probe times out', async () => {
      jest.useFakeTimers();
      try {
        mockQueryRaw.mockReturnValueOnce(new Promise(() => undefined));
        const pending = controller.getReady().catch((error: unknown) => error);
        jest.advanceTimersByTime(3001);
        const failure = await pending;
        expect(failure).toBeInstanceOf(ServiceUnavailableException);
        expect((failure as ServiceUnavailableException).getResponse()).toMatchObject({
          checks: { database: 'down' },
        });
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
