import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard for the customer self-service surface. Authenticates via the
 * `customer` passport strategy only — staff tokens are rejected by the
 * strategy. All customer routes are tenant-scoped by the middleware +
 * repository extension; nothing here grants staff/platform access.
 */
@Injectable()
export class CustomerAuthGuard extends AuthGuard('customer') {}
