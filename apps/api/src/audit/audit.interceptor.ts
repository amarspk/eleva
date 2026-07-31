import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';
import { AuthenticatedRequest } from '../common/types/request.types';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const method = request.method;
    const url = request.originalUrl || request.url;

    // Only log mutating operations per DOC-006 5.7: POST, PUT, DELETE, PATCH
    const isMutating = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);
    if (!isMutating) {
      return next.handle();
    }

    // Skip audit for auth endpoints (login, refresh) to avoid noise, and for audit logs themselves
    const skipPaths = ['/auth/login', '/auth/refresh', '/auth/logout', '/audit-logs'];
    if (skipPaths.some((p) => url.includes(p))) {
      return next.handle();
    }

    const user = request.user;
    const tenantId = user?.tenantId || request.tenantId || null;
    const userId = user?.id || null;
    const ipAddress = (request.ip || request.headers['x-forwarded-for'] || request.connection?.remoteAddress || 'unknown') as string;
    const userAgent = request.headers['user-agent'] || 'unknown';

    // Capture old values? For simplicity, we capture request body as newValues, and no oldValues
    // In real implementation, would fetch old entity from DB before update
    const newValues = request.body;

    return next.handle().pipe(
      tap({
        next: async (responseData) => {
          try {
            // Determine entity name and ID from URL
            const entityInfo = this.parseEntityFromUrl(url, request.params, responseData as Record<string, unknown> | undefined);

            await this.auditService.log({
              tenantId,
              userId,
              action: `${method}:${entityInfo.entityName}`,
              entityName: entityInfo.entityName,
              entityId: entityInfo.entityId,
              oldValues: null, // Would be fetched before mutation in advanced implementation
              newValues: this.sanitizeValues(newValues),
              ipAddress,
              userAgent: userAgent.substring(0, 512), // Truncate per schema VarChar(512)
            });
          } catch (err) {
            this.logger.error(`Failed to write audit log for ${method} ${url}: ${(err as Error).message}`);
          }
        },
        error: async (_error) => {
          // Log failed attempts as well
          try {
            await this.auditService.log({
              tenantId,
              userId,
              action: `${method}:${url}:FAILED`,
              entityName: 'Unknown',
              entityId: null,
              oldValues: null,
              newValues: this.sanitizeValues(newValues),
              ipAddress,
              userAgent: userAgent.substring(0, 512),
            });
          } catch (e) {
            this.logger.error(`Failed to write audit log for failed ${method} ${url}`);
          }
        },
      }),
    );
  }

  private parseEntityFromUrl(url: string, params: Record<string, string | string[]> | undefined, responseData: Record<string, unknown> | undefined): { entityName: string; entityId: string | null } {
    // Extract entity from URL pattern /api/v1/{entity}/...
    // e.g., /api/v1/branches -> Branch, /api/v1/menu/products -> Product, /api/v1/orders/:id/status -> Order
    const parts = url.split('/').filter(Boolean);

    // Find resource after version
    const v1Index = parts.findIndex((p) => p.startsWith('v1'));
    let resource = 'Unknown';
    if (v1Index !== -1 && parts[v1Index + 1]) {
      resource = parts[v1Index + 1];
    } else if (parts.length > 0) {
      resource = parts[parts.length - 1];
    }

    // Normalize to singular PascalCase: branches -> Branch, products -> Product, etc.
    const mapping: Record<string, string> = {
      branches: 'Branch',
      tables: 'Table',
      categories: 'Category',
      products: 'Product',
      orders: 'Order',
      customers: 'Customer',
      tenants: 'Tenant',
      users: 'User',
      webhooks: 'Webhook',
      'device-tokens': 'DeviceToken',
      billing: 'Subscription',
      admin: 'Tenant',
      assets: 'Asset',
      kds: 'Order',
    };

    const entityName = mapping[resource] || resource.charAt(0).toUpperCase() + resource.slice(1);

    // Try to get ID from params or response
    let entityId: string | null = null;
    if (params?.id) {entityId = String(params.id);}
    else if (params?.orderItemId) {entityId = String(params.orderItemId);}
    else if (responseData?.id) {entityId = String(responseData.id);}
    else if (responseData?.tenant && typeof responseData.tenant === 'object') {entityId = String((responseData.tenant as Record<string, unknown>).id);}
    else if (responseData?.orderId) {entityId = String(responseData.orderId);}

    return { entityName, entityId };
  }

  private sanitizeValues(values: unknown): Record<string, unknown> | null {
    if (!values) {return null;}
    // Remove sensitive fields
    const sensitive = ['password', 'passwordHash', 'secret', 'mfaSecret', 'secretKey'];
    const sanitized: Record<string, unknown> = { ...(values as Record<string, unknown>) };
    for (const key of sensitive) {
      if (key in sanitized) {
        sanitized[key] = '[REDACTED]';
      }
    }
    // Truncate large payloads
    const json = JSON.stringify(sanitized);
    if (json.length > 5000) {
      return { _truncated: true, preview: json.substring(0, 5000) };
    }
    return sanitized;
  }
}
