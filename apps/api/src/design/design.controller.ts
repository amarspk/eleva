import { Controller, Get, Put, Post, Body, Query, UseGuards, Param, ParseIntPipe } from '@nestjs/common';
import { DesignService, DesignData } from './design.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';

@Controller('design')
export class DesignController {
  constructor(private readonly designService: DesignService) {}

  @UseGuards(JwtAuthGuard)
  @Get('tenant/:tenantId')
  getForTenant(@Param('tenantId') tenantId: string, @Query('preview') preview?: string): Promise<unknown> {
    return this.designService.getDesign(tenantId, preview === 'true');
  }

  @UseGuards(JwtAuthGuard)
  @Put('tenant/:tenantId/draft')
  saveDraft(@Param('tenantId') tenantId: string, @Body() body: DesignData): Promise<unknown> {
    return this.designService.saveDraft(tenantId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('tenant/:tenantId/publish')
  publish(@Param('tenantId') tenantId: string): Promise<unknown> {
    return this.designService.publish(tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('tenant/:tenantId/versions')
  versions(@Param('tenantId') tenantId: string): Promise<unknown> {
    return this.designService.getVersions(tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('tenant/:tenantId/restore/:version')
  restore(@Param('tenantId') tenantId: string, @Param('version', ParseIntPipe) version: number): Promise<unknown> {
    return this.designService.restore(tenantId, version);
  }

  @Public()
  @Get('public/:tenantId')
  getPublic(@Param('tenantId') tenantId: string): Promise<unknown> {
    return this.designService.getDesign(tenantId, false).then((r) => r.published ?? r.draft);
  }

  // Platform
  @Public()
  @Get('platform')
  getPlatform(@Query('preview') preview?: string): Promise<unknown> {
    return this.designService.getPlatformDesign(preview === 'true');
  }

  @UseGuards(JwtAuthGuard)
  @Put('platform/draft')
  savePlatform(@Body() body: DesignData): Promise<unknown> {
    return this.designService.savePlatformDraft(body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('platform/publish')
  publishPlatform(): Promise<unknown> {
    return this.designService.publishPlatform();
  }
}
