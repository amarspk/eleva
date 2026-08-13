import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Put,
  UseGuards,
} from '@nestjs/common';
import { DesignService, DesignData } from './design.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AuthenticatedRequest } from '../common/types/request.types';

// Keep the original route for public compatibility while exposing the
// Backoffice workflow through the standard /api/v1 reverse-proxy namespace.
@Controller(['design', 'api/v1/design'])
@UseGuards(JwtAuthGuard, RbacPermissionGuard)
export class DesignController {
  constructor(private readonly designService: DesignService) {}

  /**
   * Resolves the only tenant id a restaurant user may operate on.
   *
   * A1: the path parameter is routing input, never an authorization source.
   * JWT tenant identity is authoritative. Platform owners retain their existing
   * cross-tenant administration capability; ordinary tenant users receive a
   * uniform 404 for a foreign id so this endpoint is not a tenant oracle.
   */
  private authorizedTenantId(req: AuthenticatedRequest, requestedTenantId: string): string {
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (user.roles.includes('PLATFORM_OWNER')) {
      return requestedTenantId;
    }

    if (!user.tenantId) {
      throw new ForbiddenException('Tenant context missing from authenticated request');
    }

    if (user.tenantId !== requestedTenantId) {
      throw new NotFoundException('Design not found');
    }

    return user.tenantId;
  }

  private requirePlatformOwner(req: AuthenticatedRequest): void {
    if (!req.user?.roles.includes('PLATFORM_OWNER')) {
      throw new ForbiddenException('Access Denied: platform design operations require PLATFORM_OWNER role');
    }
  }

  @Get('tenant/:tenantId')
  @RequirePermission('read', 'Tenant')
  getForTenant(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Req() req: AuthenticatedRequest,
    @Query('preview') preview?: string,
  ): Promise<unknown> {
    const authorizedTenantId = this.authorizedTenantId(req, tenantId);
    return this.designService.getDesign(authorizedTenantId, preview === 'true');
  }

  @Put('tenant/:tenantId/draft')
  @RequirePermission('update', 'Tenant')
  saveDraft(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Body() body: DesignData,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const authorizedTenantId = this.authorizedTenantId(req, tenantId);
    return this.designService.saveDraft(authorizedTenantId, body);
  }

  @Post('tenant/:tenantId/publish')
  @RequirePermission('update', 'Tenant')
  publish(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const authorizedTenantId = this.authorizedTenantId(req, tenantId);
    return this.designService.publish(authorizedTenantId);
  }

  @Get('tenant/:tenantId/versions')
  @RequirePermission('read', 'Tenant')
  versions(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const authorizedTenantId = this.authorizedTenantId(req, tenantId);
    return this.designService.getVersions(authorizedTenantId);
  }

  @Post('tenant/:tenantId/restore/:version')
  @RequirePermission('update', 'Tenant')
  restore(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('version', ParseIntPipe) version: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const authorizedTenantId = this.authorizedTenantId(req, tenantId);
    return this.designService.restore(authorizedTenantId, version);
  }

  /** Public tenant design access is published-only; draft is never returned. */
  @Public()
  @Get('public/:tenantId')
  getPublic(@Param('tenantId', new ParseUUIDPipe()) tenantId: string): Promise<DesignData | null> {
    return this.designService.getPublishedDesign(tenantId);
  }

  /** Public platform access is published-only. The old public preview switch is removed. */
  @Public()
  @Get('platform')
  getPlatform(): Promise<DesignData | null> {
    return this.designService.getPublishedPlatformDesign();
  }

  @Get('platform/preview')
  getPlatformPreview(@Req() req: AuthenticatedRequest): Promise<DesignData> {
    this.requirePlatformOwner(req);
    return this.designService.getPlatformPreview();
  }

  @Put('platform/draft')
  savePlatform(@Body() body: DesignData, @Req() req: AuthenticatedRequest): Promise<unknown> {
    this.requirePlatformOwner(req);
    return this.designService.savePlatformDraft(body);
  }

  @Post('platform/publish')
  publishPlatform(@Req() req: AuthenticatedRequest): Promise<unknown> {
    this.requirePlatformOwner(req);
    return this.designService.publishPlatform();
  }
}
