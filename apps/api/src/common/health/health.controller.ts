import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { prisma } from '@zayjar/db';

const READY_DB_TIMEOUT_MS = 3000;

export interface LivenessPayload {
  status: string;
  timestamp: string;
  uptime: number;
}

export interface ReadinessPayload {
  status: string;
  checks: { database: string };
  timestamp: string;
}

/**
 * AUDIT-023 — infrastructure health endpoints.
 *
 * - `/health`: the pre-existing contract is preserved unchanged for
 *   compatibility — Render (`render.yaml healthCheckPath`) and the
 *   docker-compose healthchecks still point at it.
 * - `/live`: Kubernetes liveness probe. Process-only — never touches
 *   PostgreSQL, Redis, external services, tenant resolution or auth.
 * - `/ready`: Kubernetes readiness probe. Verifies ONLY the API's required
 *   dependency: PostgreSQL. Redis is deliberately not part of readiness —
 *   the platform treats Redis as optional/fallback-capable
 *   (QueueHealthService/CacheService fall back to in-memory when REDIS_URL
 *   is unset), and AUDIT-023 must not invent a new hard Redis requirement.
 *   The probe uses `prisma.$queryRaw`, which is not covered by the
 *   tenant-scoped model extension, so it needs no tenant context.
 */
@Controller()
export class HealthController {
  @Get('health')
  getHealth(): LivenessPayload {
    return this.livenessPayload();
  }

  @Get('live')
  getLive(): LivenessPayload {
    return this.livenessPayload();
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async getReady(): Promise<ReadinessPayload> {
    const database = (await this.isDatabaseAvailable()) ? 'up' : 'down';
    const payload: ReadinessPayload = {
      status: database === 'up' ? 'ready' : 'unavailable',
      checks: { database },
      timestamp: new Date().toISOString(),
    };
    if (database !== 'up') {
      throw new ServiceUnavailableException(payload);
    }
    return payload;
  }

  private livenessPayload(): LivenessPayload {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  private async isDatabaseAvailable(): Promise<boolean> {
    try {
      const result = await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Database readiness probe timed out')), READY_DB_TIMEOUT_MS);
        }),
      ]);
      return Array.isArray(result) && result.length === 1;
    } catch {
      return false;
    }
  }
}
