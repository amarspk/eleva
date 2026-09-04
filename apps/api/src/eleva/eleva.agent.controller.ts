import { Controller, Get, Body, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedRequest } from '../common/types/request.types';
import { ElevaAgentService, AgentObjective, ExecutiveOfficeAgentState, AgentPlanResult } from './eleva.agent.service';
import { AgentTaskResult, AgentToolRisk } from './agent.task';

export interface M9SetObjectiveRequest {
  objective: string;
}

export interface M9ContinueRequest {
  objective?: string;
}

export interface M9TaskRequest {
  action: string;
  toolName?: string;
  risk?: 'LOW' | 'SENSITIVE' | 'HIGH';
  input?: Record<string, unknown>;
  approvalActionId?: string;
}

@Controller('eleva-office/agent')
export class ElevaAgentController {
  constructor(private readonly agentService: ElevaAgentService) {}

  @Get('state')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  getState(): ExecutiveOfficeAgentState {
    return this.agentService.getExecutiveOfficeAgentState();
  }

  @Post('objective')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  async setObjective(@CurrentUser() _request: AuthenticatedRequest, @Body() body: M9SetObjectiveRequest): Promise<AgentObjective> {
    const objective = typeof body.objective === 'string' && body.objective.trim() ? body.objective.trim() : 'Unnamed ELEVA objective';
    return this.agentService.setObjective(objective);
  }

  @Post('continue')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  async continueFromLastState(@CurrentUser() _request: AuthenticatedRequest, @Body() body: M9ContinueRequest): Promise<ExecutiveOfficeAgentState> {
    return this.agentService.continueFromLastState(body);
  }

  @Post('plan')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  async planNextTask(@CurrentUser() _request: AuthenticatedRequest, @Body() body: { objective?: string }): Promise<AgentPlanResult> {
    return this.agentService.planNextTask(body?.objective);
  }

  @Post('tasks')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  async runTask(@CurrentUser() request: AuthenticatedRequest, @Body() body: M9TaskRequest): Promise<AgentTaskResult> {
    if (!request.user) {
      throw new Error('Authenticated user is required before running an ELEVA task.');
    }

    const toolName = typeof body.toolName === 'string' && body.toolName.trim() ? body.toolName.trim() : undefined;
    const risk = (typeof body.risk === 'string' ? body.risk : undefined) as AgentToolRisk | undefined;
    const approvalActionId = typeof body.approvalActionId === 'string' && body.approvalActionId.trim() ? body.approvalActionId.trim() : undefined;

    return this.agentService.runTask(
      {
        action: typeof body.action === 'string' && body.action.trim() ? body.action.trim() : 'unknown',
        toolName,
        risk,
        input: body.input ?? {},
        approvalActionId,
      },
      request.user,
    );
  }

  @Post('decisions')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  recordDecision(@CurrentUser() _request: AuthenticatedRequest, @Body() body: Record<string, unknown>): Record<string, unknown> {
    const summary = typeof body.summary === 'string' && body.summary.trim() ? body.summary.trim() : 'Untitled decision';
    const rationale = typeof body.rationale === 'string' && body.rationale.trim() ? body.rationale.trim() : 'No rationale provided.';
    const approvalStatus = typeof body.approvalStatus === 'string' ? body.approvalStatus : 'pending';
    const initiatedBy = typeof body.initiatedBy === 'string' && body.initiatedBy.trim() ? body.initiatedBy.trim() : 'eleva-agent';
    return this.agentService.recordDecision({ summary, rationale, approvalStatus, initiatedBy });
  }
}
