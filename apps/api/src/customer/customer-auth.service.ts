import {
  Injectable,
  Logger,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { prisma, dbTenantContext } from '@zayjar/db';
import { AuthService } from '../auth/auth.service';
import { CsrfService } from '../common/csrf/csrf.service';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { LoginCustomerDto } from './dto/login-customer.dto';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';

/**
 * Customer self-service token lifetime. Customers authenticate against a
 * restaurant subdomain and expect to stay signed in between visits; a single
 * signed access token with a 30-day expiry reuses the existing JWT session
 * mechanism (same secret, verified per request) without the staff refresh
 * rotation, which is disproportionate for this low-risk self-service surface.
 * The token carries `type: 'customer'` so it can never satisfy the staff
 * JwtStrategy (which resolves `sub` against the User table).
 */
const CUSTOMER_TOKEN_TTL = '30d';

@Injectable()
export class CustomerAuthService {
  private readonly logger = new Logger(CustomerAuthService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly csrfService: CsrfService,
  ) {}

  /** Signs a customer token. `sub` is the customer id; `type` distinguishes it
   *  from staff tokens. */
  private async issueToken(customer: { id: string; email: string; tenantId: string }): Promise<{
    token: string;
    csrfToken: string;
    expiresIn: number;
  }> {
    const payload = {
      sub: customer.id,
      type: 'customer',
      tenantId: customer.tenantId,
      email: customer.email,
    };
    const token = await this.jwtService.signAsync(payload, { expiresIn: CUSTOMER_TOKEN_TTL });
    const csrfToken = await this.csrfService.generateToken(customer.id);
    return { token, csrfToken, expiresIn: 30 * 24 * 60 * 60 };
  }

  private toProfile(customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string | null;
    loyaltyPoints: number;
    createdAt: Date;
  }): Record<string, unknown> {
    return {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phoneNumber: customer.phoneNumber,
      loyaltyPoints: customer.loyaltyPoints,
      createdAt: customer.createdAt.toISOString(),
    };
  }

  /** Public self-service registration (tenant-scoped; 409 on duplicate email). */
  async register(dto: RegisterCustomerDto): Promise<{
    token: string;
    csrfToken: string;
    expiresIn: number;
    customer: Record<string, unknown>;
  }> {
    const existing = await prisma.customer.findMany({ where: { email: dto.email } });
    if (existing.length > 0) {
      throw new ConflictException(`Customer with email [${dto.email}] already exists under this tenant context.`);
    }

    const passwordHash = await this.authService.hashPassword(dto.password);
    const tenantId = dbTenantContext.getStore()?.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for customer registration.');
    }
    const customer = await prisma.customer.create({
      data: {
        tenantId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phoneNumber: dto.phoneNumber || null,
        passwordHash,
        loyaltyPoints: 0,
      },
    });

    const session = await this.issueToken(customer);
    this.logger.log(`Customer account created: [${customer.id}]`);
    return { ...session, customer: this.toProfile(customer) };
  }

  /** Public customer sign-in (uniform 401 — never reveals account existence). */
  async login(dto: LoginCustomerDto): Promise<{
    token: string;
    csrfToken: string;
    expiresIn: number;
    customer: Record<string, unknown>;
  }> {
    const customers = await prisma.customer.findMany({ where: { email: dto.email } });
    const customer = customers[0];
    // Uniform anti-oracle: unknown email, no password set (guest/legacy
    // profile), or wrong password all produce the same error.
    if (!customer || !customer.passwordHash) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    const valid = await this.authService.comparePassword(dto.password, customer.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const session = await this.issueToken(customer);
    return { ...session, customer: this.toProfile(customer) };
  }

  /** Customer self-service profile (tenant-scoped by the request context). */
  async getProfile(customerId: string): Promise<Record<string, unknown>> {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new UnauthorizedException('Customer account not found.');
    }
    return this.toProfile(customer);
  }

  /** Customer self-service profile update (name/phone only; email immutable). */
  async updateProfile(customerId: string, dto: UpdateCustomerProfileDto): Promise<Record<string, unknown>> {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new UnauthorizedException('Customer account not found.');
    }
    const updated = await prisma.customer.update({
      where: { id: customerId },
      data: {
        firstName: dto.firstName ?? customer.firstName,
        lastName: dto.lastName ?? customer.lastName,
        phoneNumber: dto.phoneNumber !== undefined ? dto.phoneNumber || null : customer.phoneNumber,
      },
    });
    return this.toProfile(updated);
  }

  /**
   * The customer's own order history (real data). Only orders linked to this
   * customer id are returned; the tenant-scoped extension keeps the query
   * inside the resolved tenant, so a token from restaurant A can never list
   * orders from restaurant B.
   */
  async getOrderHistory(customerId: string): Promise<Array<Record<string, unknown>>> {
    const orders = await prisma.order.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        orderItems: {
          select: {
            quantity: true,
            product: { select: { name: true } },
          },
        },
      },
    });

    return orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      type: order.type,
      paymentMethod: order.paymentMethod,
      total: Number(order.total),
      createdAt: order.createdAt.toISOString(),
      itemCount: order.orderItems.reduce((sum, item) => sum + item.quantity, 0),
      items: order.orderItems.map((item) => ({
        name: item.product?.name ?? 'Unknown Product',
        quantity: item.quantity,
      })),
    }));
  }

  /** Revokes the CSRF binding on logout; the JWT is discarded client-side. */
  async logout(customerId: string): Promise<{ success: boolean }> {
    try {
      await this.csrfService.deleteToken(customerId);
    } catch (err) {
      this.logger.warn(`CSRF token cleanup failed on customer logout: ${(err as Error).message}`);
    }
    return { success: true };
  }
}
