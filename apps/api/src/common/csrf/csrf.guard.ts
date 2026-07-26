import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { CsrfService } from './csrf.service';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { AuthenticatedRequest } from '../types/request.types';

const CSRF_HEADER = 'x-csrf-token';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly logger = new Logger('CsrfGuard');

  constructor(
    private readonly csrfService: CsrfService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method;

    // Skip CSRF validation for non-mutating requests
    if (!MUTATING_METHODS.has(method)) {
      return true;
    }

    // Skip if route is decorated with @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // Extract user ID from the authenticated request (JwtAuthGuard runs first)
    const user = (request as AuthenticatedRequest).user;
    if (!user?.id) {
      // If no user context, let JwtAuthGuard handle the auth failure
      return true;
    }

    const csrfToken = request.headers[CSRF_HEADER] as string | undefined;

    if (!csrfToken) {
      this.logger.warn(`CSRF token missing from ${method} request by user [${user.id}]`);
      throw new ForbiddenException('CSRF token is required for mutating requests');
    }

    const isValid = await this.csrfService.validateToken(user.id, csrfToken);

    if (!isValid) {
      this.logger.warn(`CSRF token validation failed for user [${user.id}] on ${method} ${request.url}`);
      throw new ForbiddenException('CSRF token validation failed');
    }

    return true;
  }
}
