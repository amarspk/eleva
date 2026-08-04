import { Controller, Post, Get, Delete, Param, Body, Req, UseGuards, HttpCode, HttpStatus, ForbiddenException , ParseUUIDPipe } from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { CreateWebhookRequestDto } from './dto/create-webhook-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types/request.types';

@Controller('api/v1/webhooks')
@UseGuards(JwtAuthGuard)
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  /**
   * POST /api/v1/webhooks
   * Creates webhook subscription, premium feature per DOC-008 7.5
   * Tenant isolation via JWT tenantId
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createWebhook(@Body() dto: CreateWebhookRequestDto, @Req() req: AuthenticatedRequest): Promise<{
    id: string;
    targetUrl: string;
    events: string[];
    isActive: boolean;
    createdAt: unknown;
  }> {
    const user = req.user;
    if (!user?.tenantId) {
      throw new ForbiddenException('Tenant context missing');
    }
    const roles = user.roles || [];
    // Premium feature: only RESTAURANT_OWNER or PLATFORM_OWNER
    if (!roles.includes('RESTAURANT_OWNER') && !roles.includes('PLATFORM_OWNER')) {
      throw new ForbiddenException('Access Denied: webhook creation requires RESTAURANT_OWNER');
    }
    return this.webhookService.createWebhook(dto, user.tenantId);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async listWebhooks(@Req() req: AuthenticatedRequest): Promise<Array<{
    id: string;
    targetUrl: string;
    events: string[];
    isActive: boolean;
    createdAt: unknown;
  }>> {
    const user = req.user;
    if (!user?.tenantId) {
      throw new ForbiddenException('Tenant context missing');
    }
    return this.webhookService.listWebhooks(user.tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteWebhook(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: AuthenticatedRequest): Promise<{ success: boolean; id: string }> {
    const user = req.user;
    if (!user?.tenantId) {
      throw new ForbiddenException('Tenant context missing');
    }
    const roles = user.roles || [];
    if (!roles.includes('RESTAURANT_OWNER') && !roles.includes('PLATFORM_OWNER')) {
      throw new ForbiddenException('Access Denied: webhook deletion requires RESTAURANT_OWNER');
    }
    return this.webhookService.deleteWebhook(id, user.tenantId);
  }
}
