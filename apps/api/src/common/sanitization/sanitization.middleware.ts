import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { SanitizationService } from './sanitization.service';

/**
 * Paths where body sanitization must be skipped to preserve raw payloads
 * for signature verification (e.g., Stripe webhook HMAC validation).
 */
const SKIP_BODY_SANITIZATION_PATHS = new Set([
  '/api/v1/billing/webhooks',
  // Tap webhook (AUDIT-002 Finding #2): the official hashstring is computed
  // from the exact posted field values — the body must arrive unmodified.
  '/api/v1/payments/webhooks/tap',
]);

/**
 * DOC-006 §5.4 — Input Sanitization Middleware
 *
 * Global NestJS middleware that processes all incoming JSON payloads
 * before they reach controllers or the ValidationPipe. Strips
 * malicious HTML/scripts from every string value in req.body.
 */
@Injectable()
export class SanitizationMiddleware implements NestMiddleware {
  private readonly logger = new Logger('SanitizationMiddleware');

  constructor(private readonly sanitizationService: SanitizationService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    // Skip body sanitization for webhook endpoints that need raw body verification
    if (SKIP_BODY_SANITIZATION_PATHS.has(req.path)) {
      return next();
    }

    // Only sanitize if a JSON body is present
    if (req.body && typeof req.body === 'object') {
      req.body = this.sanitizationService.sanitize(req.body);
    }

    next();
  }
}
