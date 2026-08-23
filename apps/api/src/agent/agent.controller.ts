import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AuthenticatedRequest } from '../common/types/request.types';
import { AgentService } from './agent.service';
import { CreateAgentSessionDto, InvokeAgentToolDto } from './dto/invoke-agent-tool.dto';

/**
 * ELEVA AI Agent V1 Slice 1 — PLATFORM_OWNER only.
 * Routes use :sessionId (not :id) so RbacPermissionGuard does not look up a
 * tenant repository.
 */
@Controller('api/v1/agent')
@UseGuards(JwtAuthGuard, RbacPermissionGuard)
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('sessions')
  @RequirePermission('create', 'Agent')
  @HttpCode(HttpStatus.CREATED)
  async createSession(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateAgentSessionDto,
  ): Promise<unknown> {
    const user = this.assertPlatformOwner(req);
    return this.agentService.createSession(
      user.id,
      dto.title,
      String(req.ip || 'unknown'),
      String(req.headers['user-agent'] || 'unknown'),
    );
  }

  @Get('sessions')
  @RequirePermission('read', 'Agent')
  @HttpCode(HttpStatus.OK)
  async listSessions(@Req() req: AuthenticatedRequest): Promise<unknown> {
    this.assertPlatformOwner(req);
    return this.agentService.listSessions();
  }

  @Get('sessions/:sessionId')
  @RequirePermission('read', 'Agent')
  @HttpCode(HttpStatus.OK)
  async getSession(
    @Req() req: AuthenticatedRequest,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ): Promise<unknown> {
    this.assertPlatformOwner(req);
    return this.agentService.getSession(sessionId);
  }

  @Post('sessions/:sessionId/invoke')
  @RequirePermission('create', 'Agent')
  @HttpCode(HttpStatus.OK)
  async invoke(
    @Req() req: AuthenticatedRequest,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() dto: InvokeAgentToolDto,
  ): Promise<unknown> {
    const user = this.assertPlatformOwner(req);
    return this.agentService.invokeSafeTool(
      sessionId,
      user.id,
      dto.tool,
      dto.args,
      String(req.ip || 'unknown'),
      String(req.headers['user-agent'] || 'unknown'),
    );
  }

  private assertPlatformOwner(req: AuthenticatedRequest): { id: string; roles: string[] } {
    const user = req.user;
    if (!user?.id) {
      throw new ForbiddenException('Authentication required');
    }
    if (!(user.roles || []).includes('PLATFORM_OWNER')) {
      throw new ForbiddenException(
        'Access Denied: ELEVA Agent V1 requires the PLATFORM_OWNER role.',
      );
    }
    return { id: user.id, roles: user.roles || [] };
  }
}
