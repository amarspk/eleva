import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { MetricsService } from './metrics.service';

/**
 * AUDIT-023 — Prometheus exposition endpoint.
 *
 * Access control: a static bearer credential configured via the
 * METRICS_TOKEN environment variable. Requests without the credential (or
 * with a wrong one) receive 401 with a constant-time comparison; when the
 * operator has not configured the credential the endpoint fails closed with
 * 503 instead of silently exposing metrics to the public internet.
 *
 * The response is a text/plain Prometheus exposition with
 * `Cache-Control: no-store` so scrapers never read a stale snapshot.
 */
@Controller()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('metrics')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async getMetrics(@Req() req: Request): Promise<string> {
    const configured = process.env.METRICS_TOKEN;
    if (!configured || configured.length === 0) {
      throw new ServiceUnavailableException('Metrics endpoint is disabled: METRICS_TOKEN is not configured.');
    }
    const match = /^Bearer (.+)$/i.exec(req.headers.authorization ?? '');
    if (!match) {
      throw new UnauthorizedException('A metrics bearer token is required.');
    }
    const provided = Buffer.from(match[1].trim());
    const expected = Buffer.from(configured);
    const valid = provided.length === expected.length && timingSafeEqual(provided, expected);
    if (!valid) {
      throw new UnauthorizedException('The metrics bearer token is invalid.');
    }
    return this.metricsService.render();
  }
}
