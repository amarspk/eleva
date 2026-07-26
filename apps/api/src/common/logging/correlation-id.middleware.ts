import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { RequestWithTenant } from '../types/request.types';

export const CORRELATION_ID_HEADER = 'X-Request-ID';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const correlationId =
      (req.headers[CORRELATION_ID_HEADER.toLowerCase()] as string) ||
      crypto.randomUUID();

    req.headers[CORRELATION_ID_HEADER.toLowerCase()] = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    (req as RequestWithTenant).correlationId = correlationId;

    next();
  }
}
