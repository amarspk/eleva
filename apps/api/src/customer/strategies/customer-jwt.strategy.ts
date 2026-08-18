import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { prisma } from '@zayjar/db';
import { JWT_CONFIG } from '../../auth/config/jwt.config';

interface CustomerTokenPayload {
  sub: string;
  type: string;
  tenantId?: string | null;
  email?: string;
}

export interface AuthenticatedCustomer {
  customerId: string;
  tenantId: string | null;
  email?: string;
}

/**
 * Customer self-service JWT strategy (Phase 4 — Customer Account).
 *
 * Strictly separated from the staff JwtStrategy:
 *   - requires the `type: 'customer'` claim (staff tokens carry no type and
 *     are rejected here);
 *   - resolves `sub` against the Customer table (a staff `sub` never matches a
 *     customer row);
 *   - the tenant-scoped Prisma extension keeps the lookup inside the request's
 *     resolved tenant, so a token minted for tenant A cannot authenticate on
 *     tenant B's host.
 *
 * The staff JwtStrategy similarly can never accept a customer token (its `sub`
 * lookup targets the User table), so the two systems are fully disjoint.
 */
@Injectable()
export class CustomerJwtStrategy extends PassportStrategy(Strategy, 'customer') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_CONFIG.accessTokenSecret,
    });
  }

  async validate(payload: CustomerTokenPayload): Promise<AuthenticatedCustomer> {
    if (payload.type !== 'customer' || !payload.sub) {
      throw new UnauthorizedException('Invalid customer session.');
    }
    const customer = await prisma.customer.findUnique({ where: { id: payload.sub } });
    if (!customer) {
      throw new UnauthorizedException('Customer account not found.');
    }
    return { customerId: customer.id, tenantId: customer.tenantId, email: customer.email };
  }
}
