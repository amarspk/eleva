import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { RateLimitGuard, RateLimit } from '../common/rate-limit/rate-limit.guard';
import { JWT_CONFIG } from '../auth/config/jwt.config';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerAuthGuard } from './guards/customer-auth.guard';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { LoginCustomerDto } from './dto/login-customer.dto';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';
import type { AuthenticatedCustomer } from './strategies/customer-jwt.strategy';

interface CustomerRequest extends Request {
  customer?: AuthenticatedCustomer;
}

/**
 * Customer self-service account surface (Phase 4 — Customer Account).
 *
 * Registration and sign-in are `@Public()` + rate-limited; everything else
 * requires the customer JWT (CustomerAuthGuard). Tenant isolation comes from
 * TenantContextMiddleware + the tenant-scoped Prisma extension — the client
 * never supplies a tenant id.
 *
 * The global CsrfGuard applies to the authenticated mutating routes
 * (PUT /me): the CSRF token is issued at register/login and echoed via the
 * `X-CSRF-Token` header by the customer client, exactly like the staff flow.
 */
@Controller()
@UseGuards(RateLimitGuard)
export class CustomerAuthController {
  constructor(private readonly customerAuthService: CustomerAuthService) {}

  @Public()
  @Post('api/v1/public/customers/register')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit('auth')
  async register(@Body() dto: RegisterCustomerDto, @Res({ passthrough: true }) res: Response): Promise<unknown> {
    const result = await this.customerAuthService.register(dto);
    this.setCsrfCookie(res, result.csrfToken);
    return result;
  }

  @Public()
  @Post('api/v1/public/customers/login')
  @HttpCode(HttpStatus.OK)
  @RateLimit('auth')
  async login(@Body() dto: LoginCustomerDto, @Res({ passthrough: true }) res: Response): Promise<unknown> {
    const result = await this.customerAuthService.login(dto);
    this.setCsrfCookie(res, result.csrfToken);
    return result;
  }

  @Get('api/v1/customer/me')
  @UseGuards(CustomerAuthGuard)
  @HttpCode(HttpStatus.OK)
  async me(@Req() req: CustomerRequest): Promise<unknown> {
    return this.customerAuthService.getProfile(this.requireCustomer(req).customerId);
  }

  @Put('api/v1/customer/me')
  @UseGuards(CustomerAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateMe(@Req() req: CustomerRequest, @Body() dto: UpdateCustomerProfileDto): Promise<unknown> {
    return this.customerAuthService.updateProfile(this.requireCustomer(req).customerId, dto);
  }

  @Get('api/v1/customer/orders')
  @UseGuards(CustomerAuthGuard)
  @HttpCode(HttpStatus.OK)
  async myOrders(@Req() req: CustomerRequest): Promise<unknown> {
    return this.customerAuthService.getOrderHistory(this.requireCustomer(req).customerId);
  }

  @Post('api/v1/customer/logout')
  @UseGuards(CustomerAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: CustomerRequest): Promise<{ success: boolean }> {
    return this.customerAuthService.logout(this.requireCustomer(req).customerId);
  }

  private requireCustomer(req: CustomerRequest): AuthenticatedCustomer {
    if (!req.customer) {
      throw new Error('CustomerAuthGuard must run before customer handlers.');
    }
    return req.customer;
  }

  private setCsrfCookie(res: Response, csrfToken: string): void {
    res.cookie('__Host-CSRF-Token', csrfToken, {
      ...JWT_CONFIG.cookieOptions,
      httpOnly: false, // readable by JS for the double-submit pattern
    });
  }
}
