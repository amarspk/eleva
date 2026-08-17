import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpStatus,
  HttpCode,
  UseGuards,
  Logger,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { JWT_CONFIG } from './config/jwt.config';
import { Public } from './decorators/public.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from '@zayjar/types';
import { MfaVerifyRequestDto } from './dto/mfa-verify-request.dto';
import { ForgotPasswordRequestDto } from './dto/forgot-password-request.dto';
import { ResetPasswordRequestDto } from './dto/reset-password-request.dto';
import { VerifyEmailRequestDto } from './dto/verify-email-request.dto';
import { RateLimitGuard, RateLimit } from '../common/rate-limit/rate-limit.guard';
import { CsrfService } from '../common/csrf/csrf.service';
import { AuthenticatedRequest, AuthenticatedUser } from '../common/types/request.types';

@Controller('api/v1/auth')
export class AuthController {
  private readonly logger = new Logger('AuthController');

  constructor(
    private readonly authService: AuthService,
    private readonly csrfService: CsrfService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit('auth')
  async login(
    @Body() dto: LoginDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string; csrfToken: string; expiresIn: number; user: Record<string, unknown> }> {
    // Resolve tenantId from middleware (subdomain, custom domain, x-tenant-id header) for tenant isolation
    // For routes excluded from TenantContextMiddleware (like this login route),
    // dbTenantContext may not be set. Platform Owners (no tenant) need a
    // platform-level context so the DB fail-safe doesn't block their login.
    const tenantId = req.tenantId || null;

    // Ensure dbTenantContext is set for the DB fail-safe extension.
    // If the middleware already set it (tenant-scoped request), this is a no-op
    // because the middleware's run() is still on the async stack.
    // If the middleware was excluded (login without tenant), we set it here.
    const { dbTenantContext } = await import('@zayjar/db');
    const existingContext = dbTenantContext.getStore();
    if (!existingContext) {
      // No context from middleware — set one now.
      // isPlatformOwner=true allows unscoped queries (needed for platform@zayjar.ai login).
      return dbTenantContext.run({ tenantId: tenantId || undefined, isPlatformOwner: true }, () => {
        return this._executeLogin(dto, tenantId, req, res);
      });
    }
    return this._executeLogin(dto, tenantId, req, res);
  }

  /** Inner login logic, called within the correct dbTenantContext. */
  private async _executeLogin(
    dto: LoginDto,
    tenantId: string | null,
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<{ accessToken: string; csrfToken: string; expiresIn: number; user: Record<string, unknown> }> {
    if (!dto.email || !dto.password) {
      // Client error, not a server fault: bare `throw new Error` yields 500.
      throw new BadRequestException('Email and password are required.');
    }

    // Real DB login with tenant isolation, password verification, and MFA check
    const userProfile = await this.authService.validateLogin(dto.email, dto.password!, (dto as { mfaToken?: string }).mfaToken, tenantId);

    const payload = {
      sub: userProfile.id,
      email: userProfile.email,
      tenantId: userProfile.tenantId,
      roles: userProfile.roles,
      permissions: userProfile.permissions,
      branches: userProfile.branches,
    };

    const { accessToken, refreshToken } = await this.authService.generateTokens(payload);

    // Generate CSRF token for double-submit pattern (DOC-006 §5.3)
    const csrfToken = await this.csrfService.generateToken(payload.sub);

    // Set secure HTTP-Only sliding cookie
    res.cookie('__Host-Refresh-Token', refreshToken, JWT_CONFIG.cookieOptions);

    // Set CSRF token as a non-HttpOnly cookie so JavaScript can read it
    res.cookie('__Host-CSRF-Token', csrfToken, {
      ...JWT_CONFIG.cookieOptions,
      httpOnly: false, // Must be readable by JavaScript for double-submit pattern
    });

    return {
      accessToken,
      csrfToken,
      expiresIn: 900,
      user: {
        id: payload.sub,
        tenantId: payload.tenantId,
        email: payload.email,
        roles: payload.roles,
        branches: userProfile.branches,
        firstName: userProfile.firstName,
        lastName: userProfile.lastName,
        mfaRequired: false,
        mfaEnabled: userProfile.mfaEnabled,
      },
    };
  }

  /**
   * POST /api/v1/auth/forgot-password (AUDIT-005)
   * Public, rate-limited (auth tier). Always returns the SAME generic
   * response — never reveals whether an account exists. An email is only
   * dispatched when the account exists.
   */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit('auth')
  async forgotPassword(@Body() dto: ForgotPasswordRequestDto): Promise<{ message: string }> {
    return this.authService.requestPasswordReset(dto.email);
  }

  /**
   * POST /api/v1/auth/reset-password (AUDIT-005)
   * Public, rate-limited (auth tier). Validates the one-time token, rehashes
   * the new password (Argon2id), clears the token and revokes all sessions.
   */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit('auth')
  async resetPassword(@Body() dto: ResetPasswordRequestDto): Promise<{ message: string }> {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  /**
   * POST /api/v1/auth/verify-email (AUDIT-005)
   * Public, rate-limited (auth tier). One-time expiring verification token
   * marks the account's email as verified.
   */
  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit('auth')
  async verifyEmail(@Body() dto: VerifyEmailRequestDto): Promise<{ message: string }> {
    return this.authService.verifyEmail(dto.token);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string; csrfToken: string; expiresIn: number }> {
    // Extract token from secure cookie
    const oldRefreshToken = req.cookies?.['__Host-Refresh-Token'];

    if (!oldRefreshToken) {
      // A missing/expired refresh cookie is an authentication condition (401),
      // not a server fault. Reported as HTTP 500 before this fix
      // (runtime-verified), which also breaks normal client re-login handling:
      // an SPA retries on 401 but treats 500 as an outage.
      throw new UnauthorizedException('Refresh session cookie is missing.');
    }

    // Rotation returns the subject of the ALREADY signature-verified old
    // refresh token (C-2 / AUTHZ-002 — no unverified decode anywhere).
    const { accessToken, refreshToken, sub } = await this.authService.rotateRefreshToken(oldRefreshToken);

    // Generate new CSRF token on refresh (DOC-006 §5.3)
    const csrfToken = sub ? await this.csrfService.generateToken(sub) : '';

    // Rotate and set fresh sliding cookie
    res.cookie('__Host-Refresh-Token', refreshToken, JWT_CONFIG.cookieOptions);

    // Set new CSRF token cookie
    res.cookie('__Host-CSRF-Token', csrfToken, {
      ...JWT_CONFIG.cookieOptions,
      httpOnly: false,
    });

    return {
      accessToken,
      csrfToken,
      expiresIn: 900,
    };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`Logging out user session for sub: ${user?.id || 'unknown'}`);
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      // Blacklist access token for its remaining life (e.g. 15 minutes)
      await this.authService.blacklistToken(token, 900);
    }

    // Delete CSRF token from Redis (DOC-006 §5.3)
    if (user?.id) {
      await this.csrfService.deleteToken(user.id);
    }

    // Clear refresh cookie
    res.clearCookie('__Host-Refresh-Token', JWT_CONFIG.cookieOptions);

    // Clear CSRF token cookie
    res.clearCookie('__Host-CSRF-Token', {
      ...JWT_CONFIG.cookieOptions,
      httpOnly: false,
    });

    return {
      success: true,
      message: 'Active session successfully terminated.'
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getMe(@CurrentUser() user: AuthenticatedUser): Promise<{ user: Record<string, unknown> }> {
    // user contains id, tenantId, email, roles, permissions from JWT
    const profile = await this.authService.getMe(user.id, user.tenantId);

    return {
      user: {
        id: profile.id,
        tenantId: profile.tenantId,
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: user.email || profile.email,
        roles: user.roles || [],
        permissions: user.permissions || [],
        mfaEnabled: profile.mfaEnabled || false,
      },
    };
  }

  @Post('mfa/enable')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async enableMfa(@CurrentUser() user: AuthenticatedUser): Promise<{ secret: string; qrCodeDataUrl: string }> {
    const result = await this.authService.generateMfaSecret(user.id, user.tenantId, user.email);
    return result;
  }

  @Post('mfa/verify')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async verifyMfa(@CurrentUser() user: AuthenticatedUser, @Body() dto: MfaVerifyRequestDto): Promise<{ mfaEnabled: boolean; backupCodes: string[] }> {
    const result = await this.authService.verifyMfaSetup(user.id, user.tenantId, dto.mfaToken);
    return result;
  }
}
