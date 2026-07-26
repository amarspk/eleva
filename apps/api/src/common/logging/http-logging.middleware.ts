import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { getGlobalLogger } from './logger.service';
import { RequestWithTenant } from '../types/request.types';

@Injectable()
export class HttpLoggingMiddleware implements NestMiddleware {
  private readonly logger = getGlobalLogger().child('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();
    const { method, url } = req;
    const correlationId = (req as RequestWithTenant).correlationId || req.headers['x-request-id'] || '';

    const originalEnd = res.end;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res.end = function (this: Response, ...args: any[]) {
      const duration = Date.now() - start;
      const { statusCode } = res;

      const meta: Record<string, unknown> = {
        correlationId,
        ip: req.ip,
        userAgent: req.headers['user-agent'] || '',
        contentLength: res.getHeader('content-length') || 0,
      };

      if (statusCode >= 500) {
        getGlobalLogger().error(
          `HTTP ${method} ${url} ${statusCode} ${duration}ms`,
          undefined,
          'HTTP',
        );
      } else if (statusCode >= 400) {
        getGlobalLogger().warn(
          `HTTP ${method} ${url} ${statusCode} ${duration}ms`,
          'HTTP',
        );
      } else {
        getGlobalLogger().logRequest(method, url, statusCode, duration, meta);
      }

      return originalEnd.apply(this, args);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    next();
  }
}
